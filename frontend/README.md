# Parametric Insurance - Frontend

A production Web3 dashboard for the `ParametricInsurance` GenLayer intelligent
contract. It lets anyone underwrite a flight-delay policy, submit a claim against
an allowlisted flight-status source, trigger consensus evaluation, and withdraw
refunds - all wired directly to the live StudioNet deployment.

The smart contract is unchanged; this app only reads and writes its public API
through the GenLayer JS SDK.

## Stack

- Vite + React 18 + TypeScript
- Tailwind CSS v4 (design tokens as CSS variables)
- shadcn/ui-style components on Radix primitives (Dialog, Tabs, Label)
- `genlayer-js` 1.1.8 for contract reads/writes and transaction polling
- lucide-react icons, IBM Plex Sans / Mono typography

## Design system

Swiss-minimalist, dark-mode first. Gold (`#F59E0B`) signals trust and primary
actions; violet (`#8B5CF6`) signals the on-chain / consensus layer. Numeric and
on-chain values use tabular monospaced figures to prevent layout shift.

## Getting started

```bash
cd frontend
cp .env.example .env      # optional; sensible defaults are baked in
npm install
npm run dev               # http://localhost:5173
```

### Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_CONTRACT_ADDRESS` | `0x8Ed11A2C8bae3584110FecF9D7Ac3325ca2aD896` | Deployed contract address. |
| `VITE_GENLAYER_NETWORK` | `studionet` | Target GenLayer network. |

A burner session account is generated in the browser and persisted in
`localStorage`. StudioNet is gasless, so a zero-balance account can still send
transactions. Use the rotate button in the header to start a fresh account.

## Transaction handling

GenLayer settlement runs real web rendering plus an LLM extraction under
validator consensus, so writes can take minutes. Every write goes through
`writeAndWait` in `src/lib/genlayer.ts`, which:

1. Signs and submits the transaction.
2. Waits for `ACCEPTED` on a fast cadence (optimistic confirmation).
3. Waits for `FINALIZED` on a slower cadence with a very long retry ceiling
   (~30 minutes for `evaluate_claim`) so status updates surface without
   premature timeouts.

Each stage is reported to the UI (`TxProgress`) so the long consensus pipeline
is legible instead of a blind spinner.

## Structure

```text
src/
  lib/
    genlayer.ts        SDK client, reads, writes, extended tx polling
    format.ts          wei <-> GEN, timestamps, addresses
    contract-meta.ts   status metadata, coverage constants, record types
    utils.ts           cn() class merge
  components/
    ui/                shadcn-style primitives
    layout/            Header, Hero, Logo, footer
    dashboard/         pool stats overview
    policy/            buy form, policy cards/list, claim dialog, account panel
  hooks/
    useTx.ts           per-transaction stage state
  App.tsx              dashboard composition
```

## Build

```bash
npm run build      # tsc project references + vite production build
npm run preview
```
