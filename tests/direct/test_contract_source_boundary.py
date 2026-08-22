"""Guard: the set of files GenVM may identify as contract source stays exact.

GenVM's semantic validation is run per-file over the submitted source set. It
has no manifest to consult, so a reviewer's contract detector falls back to a
heuristic: a Python file that is not recognisably a test module is treated as a
contract and then rejected (``E105 No contract class found``) when it has no
contract class in it. A test-only helper module - the usual offender being
``tests/direct/conftest.py`` - therefore fails validation despite never being
deployed.

Two invariants keep the boundary unambiguous, and this module asserts both:

  1. Every Python file in the repository is either real contract source under
     ``contracts/`` or a pytest module named ``test_*.py``. There is no third
     category for a detector to guess about.
  2. Every Python file under ``contracts/`` really does define a contract class
     and carry the GenVM dependency header, so each file the detector *does*
     identify validates cleanly.

The class check is AST-only: it needs no SDK download and stays valid offline,
which is what lets this run in the normal unit-test sweep. ``genvm-lint check``
remains the authoritative validation - this just stops the source set from
drifting back into the state that was rejected.
"""

import ast
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
CONTRACTS_DIR = REPO_ROOT / "contracts"

# Directories that hold no submitted source: build output, caches, and envs.
IGNORED_DIRS = {
    ".git",
    ".venv",
    "venv",
    "__pycache__",
    ".pytest_cache",
    "artifacts",
    "node_modules",
}

ASCII_TEXT_SUFFIXES = {
    ".ini",
    ".json",
    ".md",
    ".py",
    ".txt",
    ".yaml",
    ".yml",
}


def _python_files() -> list[Path]:
    """Every .py file in the repo that could plausibly be read as source."""
    return sorted(
        path
        for path in REPO_ROOT.rglob("*.py")
        if not IGNORED_DIRS.intersection(path.relative_to(REPO_ROOT).parts)
    )


def _contract_files() -> list[Path]:
    return sorted(CONTRACTS_DIR.rglob("*.py"))


def _defines_contract_class(source: str) -> bool:
    """True if the module defines a ``gl.Contract`` subclass.

    Mirrors how the linter locates the contract class, but over the AST rather
    than by importing, so no SDK is required.
    """
    tree = ast.parse(source)
    for node in ast.walk(tree):
        if not isinstance(node, ast.ClassDef):
            continue
        for base in node.bases:
            # `class X(gl.Contract)` or, after `from genlayer import *`, `class X(Contract)`.
            if isinstance(base, ast.Attribute) and base.attr == "Contract":
                return True
            if isinstance(base, ast.Name) and base.id == "Contract":
                return True
    return False


def test_no_python_file_outside_contracts_can_be_read_as_contract_source():
    """Nothing outside contracts/ is anything but a pytest module.

    A helper module (``conftest.py``, ``helpers.py``, ``utils.py``, ...) would
    be picked up as contract source and fail semantic validation, so shared test
    constants and mock helpers live inside the ``test_*.py`` module that uses
    them.
    """
    strays = [
        path.relative_to(REPO_ROOT).as_posix()
        for path in _python_files()
        if CONTRACTS_DIR not in path.parents and not path.name.startswith("test_")
    ]

    assert strays == [], (
        "These files are neither contract source nor pytest modules, so a GenVM "
        f"contract detector will identify them as submitted contracts: {strays}. "
        "Move their contents into the test module that uses them, or into "
        "contracts/ if they really are contract source."
    )


def test_every_python_file_under_contracts_is_a_real_contract():
    """Every file the detector *does* identify must hold a contract class."""
    contracts = _contract_files()
    assert contracts, "expected at least one contract under contracts/"

    without_class = [
        path.relative_to(REPO_ROOT).as_posix()
        for path in contracts
        if not _defines_contract_class(path.read_text())
    ]

    assert without_class == [], (
        "These files sit in contracts/ but define no gl.Contract subclass, so "
        f"semantic validation reports 'No contract class found': {without_class}"
    )


@pytest.mark.parametrize(
    "contract_path", _contract_files(), ids=lambda p: p.name
)
def test_contract_declares_genvm_dependency_header(contract_path):
    """Each contract pins its runner, so validation resolves a known SDK."""
    first_line = contract_path.read_text().splitlines()[0]

    assert first_line.startswith("#") and "Depends" in first_line, (
        f"{contract_path.name} is missing the GenVM dependency header "
        '(# { "Depends": "py-genlayer:<hash>" }) on line 1'
    )


def test_repository_source_and_documentation_are_ascii_only():
    """Contract-adjacent text stays portable and contains only ASCII bytes."""
    violations = []
    for path in sorted(REPO_ROOT.rglob("*")):
        if not path.is_file():
            continue
        relative = path.relative_to(REPO_ROOT)
        if IGNORED_DIRS.intersection(relative.parts):
            continue
        if path.suffix.lower() not in ASCII_TEXT_SUFFIXES:
            continue
        data = path.read_bytes()
        offsets = [index for index, byte in enumerate(data) if byte > 0x7F]
        if offsets:
            violations.append(f"{relative.as_posix()}: byte offsets {offsets[:10]}")

    assert violations == [], "Non-ASCII text found:\n" + "\n".join(violations)
