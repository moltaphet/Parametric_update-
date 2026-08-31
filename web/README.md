# Parametric - Next.js client

Landing experience for the ParametricInsurance GenLayer intelligent contract.
Next.js App Router, Tailwind v4, Framer Motion, and React Three Fiber.

This app is additive. The existing Vite client in `../frontend` is untouched and
still runnable; nothing is deleted until this replaces it in full.

## Run

```bash
cp .env.example .env.local
npm install
npm run dev          # http://localhost:3000
```

```bash
npm run typecheck    # tsc --noEmit
npm run build        # production build
```

Do not run `npm run build` while `npm run dev` is live. Both write to `.next`,
and the build replaces assets the dev server is still serving, which renders the
page unstyled until the dev server is restarted.

## Structure

```text
src/
  app/
    layout.tsx           fonts, metadata, skip-link
    page.tsx             landing composition
    globals.css          design tokens + composed utilities
    dashboard/page.tsx   placeholder route (next slice)
  components/
    three/               WebGL scene
      HeroScene.tsx      canvas, pointer tracking, capability + motion checks
      ShieldCore.tsx     nested icosahedra, pointer-damped tilt
      OrbitRings.tsx     inclined orbits with travelling markers
      ParticleField.tsx  static point cloud with generated circular sprite
    landing/             Hero, StatsTicker, ValueProps, CoverageTimeline, CtaBand
    layout/              Navbar, Footer
    ui/                  Button, GlassCard
  hooks/
    useContractStats.ts  polls get_stats(), keeps last good value
  lib/
    contract.ts          read-only GenLayer client and view bindings
    format.ts            BigInt-based wei/GEN formatting
    utils.ts             cn()
```

## Wallet

Two connectors, because GenLayer has two different signing stories and neither
covers every user.

| Connector | Needs | Notes |
|-----------|-------|-------|
| `session` | nothing | Keypair generated in-browser, held in `localStorage`. StudioNet is gasless, so a zero-balance account can transact. **Default.** |
| `injected` | an EIP-1193 provider | genlayer-js routes `eth_sendTransaction` / `personal_sign` to `window.ethereum` when the client's `account` is an address string rather than an account object. |

**The injected connector additionally needs the GenLayer MetaMask Snap to sign
GenVM transactions on a Studio chain.** genlayer-js 1.1.8 does not export its
Snap installer, so this connector is offered only when a provider is actually
detected and is never the default. On StudioNet, `session` is the path that
works end to end.

### Files

```text
src/lib/wallet.ts            connectors, persistence, EIP-1193 error mapping
src/context/wallet.tsx       React context, restore, provider events
src/components/wallet/
  ConnectButton.tsx          navbar control: picker, address chip, account menu
  WalletPanel.tsx            dashboard surface + session custody disclosure
src/components/ui/Toast.tsx  toast system used for connection feedback
src/app/providers.tsx        ToastProvider > WalletProvider
```

`wallet.ts` holds no React state, so it is testable and reusable. The live viem
client lives in module scope rather than React state: it is not renderable, and
storing it in state causes needless re-renders.

### Behavior worth knowing

- **Silent restore.** On load, the injected connector calls `eth_accounts`, never
  `eth_requestAccounts`. It reconnects only if access is still authorized, so a
  user who revoked access in their wallet returns disconnected instead of seeing
  a stale address. Until restore settles, the button renders a skeleton so a
  returning user never sees "Connect wallet" flash.
- **Disconnect is non-destructive by default.** It drops the client and forgets
  the connector preference, but keeps the session key so reconnecting returns the
  same address. "New session address" discards the key permanently.
- **A dApp cannot revoke its own wallet permission.** Only the user can, from the
  wallet UI. Disconnect clears our session; reconnecting may not re-prompt. That
  is expected EIP-1193 behavior.
- **Errors map by code, never by message.** `4001` becomes "Connection
  cancelled" (info, not an error), `-32002` becomes "Check your wallet". Missing
  extension points the user at the session wallet rather than dead-ending.
- **`localStorage` access is fully guarded.** Safari private mode and embedded
  webviews throw `SecurityError` on access, so a hostile storage environment
  degrades to an in-memory session instead of breaking the page.

### Verification

The flow was verified end to end against the dev server with Playwright driving
system Chrome: 27 checks covering connect, persistence, auto-reconnect on
reload, disconnect, reconnect-to-same-address, EIP-1193 rejection, silent
restore, and wallet-side revocation. That script is not committed; there is
still no test suite in this workspace (see Status).

## Transactions

Writes go through the wallet client from `lib/wallet.ts`, so both connectors
work unchanged - the session connector signs locally, the injected connector
delegates to the extension. Nothing in the dispatch layer knows which is active.

```text
src/lib/transactions.ts       writeAndWait, tx.* wrappers, error classification
src/hooks/useTransaction.ts   stage machine + toasts + concurrency guard
src/components/policy/
  TxProgress.tsx              consensus checkpoint visualizer
  BuyPolicyForm.tsx           create_policy + pre-flight capacity check
  FundPoolCard.tsx            fund_pool
  PolicyList.tsx              per-holder policy list
  DashboardClient.tsx         shared refresh + pool stats
```

### The consensus pipeline

GenLayer settlement has two checkpoints, not one:

| Stage | Meaning |
|-------|---------|
| `ACCEPTED` | Validators accepted the transaction. Optimistic, fast. |
| `FINALIZED` | Consensus is final and effects are durable. |

`evaluate_claim` runs a live web render plus an LLM extraction under consensus,
so FINALIZED can take minutes. Polling budgets in `WAIT` are deliberately
generous (~10 min to accepted, ~30 min to finalized): a premature timeout reads
to the user as a failed transaction when consensus is simply still running,
which is the worst possible false signal for something that moves money.
`TxProgress` narrates the checkpoints rather than showing a blind spinner.

### Error handling

`describeError` prefers the contract's own classified message. The contract
prefixes failures with `[EXPECTED]`, `[EXTERNAL]`, `[TRANSIENT]`, or
`[LLM_ERROR]`; when present that text is extracted and the machine tag stripped,
because "Past coverage cutoff" beats a wall of RPC envelope. Two cases are
special-cased ahead of it:

- **User rejection** (EIP-1193 `4001`) is normal behavior, reported as an info
  toast titled "Transaction cancelled", not as an error.
- **Insufficient funds** gets a plain-language message instead of the raw
  provider string.

`useTransaction` does not rethrow. It returns the receipt or `null`, because
every caller was otherwise writing the same try/catch to swallow an error the
hook had already surfaced.

### Pre-flight capacity check

`create_policy` fully collateralizes each policy and refuses the sale unless the
pool can already cover the worst case:

```text
unreserved_available + premium >= premium * 12
  =>  premium <= unreserved / 11
```

`BuyPolicyForm` evaluates that client-side before dispatching. Without it, an
underfunded pool produces a revert that only arrives *after* the user has waited
through consensus - the contract is right to refuse, but minutes later is a poor
way to learn it.

### Live deployment state

As of the last check, the deployed contract at
`0x8Ed11A2C8bae3584110FecF9D7Ac3325ca2aD896` has an **empty pool**
(`unreserved_available_atto == 0`), so every purchase is refused until it is
funded. Separately, a fresh session account holds **0 GEN**: StudioNet is
gasless for *gas*, but `fund_pool` and `create_policy` are payable and still
require balance. Both are deployment state, not code defects. Fund an account,
then seed the pool with at least 11x the largest premium you intend to sell.

## Brand mark

`public/logo-mark-512.png` is the only logo asset. It was derived from the source
art at `../frontend/LOGO.jpeg` (2048x2048 JPEG, 1.87 MB, no alpha channel).

The source is a glowing shield on an opaque dark navy field. Dropping it into the
glass navbar directly would render a visible rectangular plate on every dark
surface, so the background was keyed out using **luminance as alpha**: the field
sits at luminance 14-24 while the mark peaks at 255, so a ramp over that range
produces a clean cutout that preserves the glow falloff instead of hard-clipping
it. The result was cropped to its alpha bounding box and downscaled.

`next/image` handles format negotiation and sizing from that single PNG, serving
about 6.8 KB of WebP at navbar size. Do not add hand-generated WebP or smaller
PNG variants; they are redundant and drift out of sync.

Do not reference the raw JPEG anywhere in the UI.

`src/app/icon.png` and `src/app/apple-icon.png` are the favicon and touch icon.
Both composite the mark onto an opaque dark tile so it holds contrast in a
browser tab regardless of the user's theme.

## Design system

Tokens live in `src/app/globals.css` under `@theme`, so Tailwind generates
utilities from them and there is no JS config file. The palette is two neutral
ramps (`obsidian`) plus one accent (`accent`, cyan) with a `halo` blue used only
for gradients and depth. Restricting the accent to a single hue is what keeps the
neon reading as signal rather than decoration.

Four composed utilities carry the visual motifs: `glass`, `glass-strong`,
`bloom`, `text-gradient`, and `grid-substrate`.

## Notes on the 3D scene

- Loaded via `next/dynamic` with `ssr: false`. This is required, not cosmetic:
  three touches `window` during module evaluation.
- Pointer position is held in a ref and read inside `useFrame`. Storing it in
  state would re-render the tree on every mouse move.
- WebGL is probed before the canvas mounts. Without support the scene renders
  nothing and the CSS bloom carries the hero on its own.
- `prefers-reduced-motion` freezes the animation loop but still renders the
  object, so the composition survives for users who do not want movement.
- Particle count scales down on small viewports; device pixel ratio is capped
  at 2.

## Amounts

Every value from the contract is wei (1 GEN = 10^18). `lib/format.ts` parses
with `BigInt` throughout - a 12 GEN payout is 1.2e19, well past
`Number.MAX_SAFE_INTEGER`, so `Number` would silently lose precision.

## Status

Shipped: design system, 3D hero, live stats ticker, value props, coverage
timeline, CTA, responsive nav and footer.

Next slice: wallet connection, policy purchase with live eligibility checking via
`check_coverage_eligibility()`, active policy tracking, and claim/payout status.
The Vite client in `../frontend` has working implementations of all four to port
from, including the write path and transaction lifecycle handling.

Not yet present: automated tests. Vitest plus React Testing Library over
`src/lib` and `src/hooks`, and an `npm ci && npm run build` job in
`.github/workflows/ci.yml`, are the recommended additions.
