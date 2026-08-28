import { useCallback, useRef, useState } from "react";
import type { TxProgress, TxStage } from "@/lib/genlayer";
import { describeError } from "@/lib/genlayer";
import type { TxState } from "@/components/policy/TxProgress";

const IDLE: TxState = { active: false, stage: "signing", message: "" };

type Runner = (onStage: (p: TxProgress) => void) => Promise<TxProgress>;

/**
 * Drives a single write transaction and exposes granular stage state for the
 * TxProgress visualizer. Returns the resolved receipt or throws upward.
 */
export function useTx() {
  const [state, setState] = useState<TxState>(IDLE);
  const busyRef = useRef(false);

  const reset = useCallback(() => setState(IDLE), []);

  const run = useCallback(async (runner: Runner): Promise<TxProgress | null> => {
    if (busyRef.current) return null;
    busyRef.current = true;
    setState({ active: true, stage: "signing", message: "Signing transaction..." });
    try {
      const result = await runner((p) => {
        setState({
          active: p.stage !== "finalized",
          stage: p.stage as TxStage,
          message: p.message,
          hash: p.hash,
        });
      });
      setState({
        active: false,
        stage: "finalized",
        message: result.message,
        hash: result.hash,
      });
      return result;
    } catch (err) {
      setState((prev) => ({
        active: false,
        stage: "error",
        message: "",
        hash: prev.hash,
        error: describeError(err),
      }));
      throw err;
    } finally {
      busyRef.current = false;
    }
  }, []);

  return { state, run, reset, busy: state.active };
}
