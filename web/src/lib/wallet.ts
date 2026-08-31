/**
 * Wallet core.
 *
 * Design rules, each of which fixes a concrete failure in the previous version:
 *
 *  1. Enumerate every injected wallet, never guess one. EIP-6963 exists because
 *     multiple extensions overwrite `window.ethereum`; picking "the first one
 *     announced" and labelling it MetaMask is how a Rabby user ends up staring
 *     at a MetaMask prompt that never appears.
 *
 *  2. Pin the provider on connect. Every later call - chain switch, event
 *     subscription, snap check - uses the exact object the user connected with,
 *     never a fresh lookup that may resolve to a different extension.
 *
 *  3. Never fight the extension. The GenLayer Snap is attempted best-effort for
 *     wallets that support Snaps; a wallet that does not (Rabby, Brave, most
 *     non-MetaMask wallets) still connects instead of being locked out.
 *
 *  4. Fail quietly and once. Everything throws a single typed WalletError; the
 *     UI maps the code to one message. No cascading rethrows.
 *
 * React bindings live in context/wallet.tsx; this module holds no React state.
 */

import { createAccount, createClient, generatePrivateKey } from "genlayer-js";
import * as chains from "genlayer-js/chains";
import type { GenLayerChain, GenLayerClient } from "genlayer-js/types";
import { NETWORK } from "./contract";

const LAST_WALLET_KEY = "parametric.wallet.last.v2";
const SESSION_KEY = "parametric.wallet.session.v2";
const GENLAYER_SNAP_ID = "npm:genlayer-wallet-plugin";

/** `session` is only offered when no extension is installed. */
export type WalletKind = "injected" | "session";

export interface WalletSnapshot {
  status: "disconnected" | "connecting" | "connected";
  address: `0x${string}` | null;
  chainId: number | null;
  kind: WalletKind | null;
  /** Wallet name for display, e.g. "Rabby". Null for the session wallet. */
  walletName: string | null;
  /** EIP-6963 uuid of the connected wallet, when it announced one. */
  walletId: string | null;
}

export const DISCONNECTED: WalletSnapshot = {
  status: "disconnected",
  address: null,
  chainId: null,
  kind: null,
  walletName: null,
  walletId: null,
};

// --------------------------------------------------------------------------- //
// Errors
// --------------------------------------------------------------------------- //
export type WalletErrorCode =
  | "NO_PROVIDER"
  | "USER_REJECTED"
  | "REQUEST_PENDING"
  | "NO_ACCOUNTS"
  | "UNKNOWN";

export class WalletError extends Error {
  readonly code: WalletErrorCode;
  constructor(code: WalletErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "WalletError";
    this.code = code;
  }
}

/**
 * Normalize any provider rejection into a typed error.
 *
 * 4001 (user closed the prompt) and -32002 (a prompt is already open, often
 * behind the browser window) are ordinary user behavior, not faults, and the UI
 * reports them as information rather than errors.
 */
function asWalletError(error: unknown, fallback: string): WalletError {
  if (error instanceof WalletError) return error;
  const code = (error as { code?: unknown })?.code;
  if (code === 4001) {
    return new WalletError("USER_REJECTED", "Request rejected in your wallet.", {
      cause: error,
    });
  }
  if (code === -32002) {
    return new WalletError(
      "REQUEST_PENDING",
      "A request is already open. Check your wallet extension.",
      { cause: error }
    );
  }
  return new WalletError("UNKNOWN", fallback, { cause: error });
}

// --------------------------------------------------------------------------- //
// Provider discovery (EIP-6963, with a legacy fallback)
// --------------------------------------------------------------------------- //
interface Eip1193Provider {
  request(args: { method: string; params?: unknown }): Promise<unknown>;
  on?(event: string, handler: (...args: never[]) => void): void;
  removeListener?(event: string, handler: (...args: never[]) => void): void;
}

export interface WalletOption {
  id: string;
  name: string;
  icon: string | null;
  provider: Eip1193Provider;
}

const announced = new Map<string, WalletOption>();

function legacyOption(): WalletOption | null {
  if (typeof window === "undefined") return null;
  const eth = (window as { ethereum?: Eip1193Provider & { isMetaMask?: boolean; isRabby?: boolean } })
    .ethereum;
  if (!eth) return null;
  // Only used when nothing announced via EIP-6963, so the name is best-effort.
  const name = eth.isRabby ? "Rabby" : eth.isMetaMask ? "MetaMask" : "Browser wallet";
  return { id: "legacy", name, icon: null, provider: eth };
}

/** Every injected wallet currently known, newest discovery last. */
export function listWallets(): WalletOption[] {
  if (announced.size > 0) return [...announced.values()];
  const legacy = legacyOption();
  return legacy ? [legacy] : [];
}

export function hasInjectedWallet(): boolean {
  return listWallets().length > 0;
}

/**
 * Subscribe to the set of available wallets.
 *
 * Purely event-driven: announce-listener plus the legacy `ethereum#initialized`
 * event. The previous implementation also ran a 300ms polling interval, which
 * re-emitted constantly and was a source of redundant renders; EIP-6963 already
 * guarantees an announcement whenever a wallet becomes ready.
 */
export function subscribeToWallets(onChange: (wallets: WalletOption[]) => void): () => void {
  if (typeof window === "undefined") return () => {};

  const emit = () => onChange(listWallets());

  const onAnnounce = (event: Event) => {
    const detail = (
      event as CustomEvent<{
        info: { uuid: string; name: string; icon: string };
        provider: Eip1193Provider;
      }>
    ).detail;
    if (!detail?.provider || !detail?.info?.uuid) return;
    announced.set(detail.info.uuid, {
      id: detail.info.uuid,
      name: detail.info.name,
      icon: detail.info.icon ?? null,
      provider: detail.provider,
    });
    emit();
  };

  window.addEventListener("eip6963:announceProvider", onAnnounce);
  window.addEventListener("ethereum#initialized", emit);
  // Ask wallets that loaded before this listener existed to re-announce.
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  emit();

  return () => {
    window.removeEventListener("eip6963:announceProvider", onAnnounce);
    window.removeEventListener("ethereum#initialized", emit);
  };
}

// --------------------------------------------------------------------------- //
// Storage (guarded: Safari private mode and some webviews throw on access)
// --------------------------------------------------------------------------- //
function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* non-fatal */
  }
}
function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* non-fatal */
  }
}

// --------------------------------------------------------------------------- //
// Chain
// --------------------------------------------------------------------------- //
function resolveChain(): GenLayerChain {
  const map = chains as unknown as Record<string, GenLayerChain>;
  return map[NETWORK] ?? map.studionet;
}

export function getConfiguredChainId(): number {
  return Number(resolveChain().id);
}

// --------------------------------------------------------------------------- //
// Connection state
//
// The provider is pinned here on connect. Looking it up again later is what
// allowed events and chain switches to bind to a different extension than the
// one the user actually connected with.
// --------------------------------------------------------------------------- //
let client: GenLayerClient<GenLayerChain> | null = null;
let activeProvider: Eip1193Provider | null = null;

export function getWalletClient(): GenLayerClient<GenLayerChain> | null {
  return client;
}

export function requireWalletClient(): GenLayerClient<GenLayerChain> {
  if (!client) {
    throw new WalletError("NO_ACCOUNTS", "Connect a wallet to sign transactions.");
  }
  return client;
}

/**
 * Align the wallet with StudioNet. Best-effort by design.
 *
 * A failure here is reported to the caller but must not abort a connection:
 * being on the wrong network is a recoverable state the UI already surfaces,
 * whereas refusing to connect leaves the user with nothing to act on.
 */
async function trySwitchChain(provider: Eip1193Provider): Promise<void> {
  const chain = resolveChain();
  const chainIdHex = `0x${Number(chain.id).toString(16)}`;

  let current: string | undefined;
  try {
    current = (await provider.request({ method: "eth_chainId" })) as string;
  } catch {
    return;
  }
  if (current?.toLowerCase() === chainIdHex.toLowerCase()) return;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
  } catch (error) {
    // 4902 (and -32603 from wallets that wrap it) means the chain is unknown.
    const code = (error as { code?: unknown })?.code;
    if (code !== 4902 && code !== -32603) throw asWalletError(error, "Network switch failed.");
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: chainIdHex,
          chainName: chain.name,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: chain.rpcUrls.default.http,
          blockExplorerUrls: chain.blockExplorers?.default?.url
            ? [chain.blockExplorers.default.url]
            : undefined,
        },
      ],
    });
  }
}

/**
 * Install the GenLayer Snap if this wallet supports Snaps.
 *
 * MetaMask needs it to sign GenVM transactions. Wallets without Snaps support
 * answer `wallet_getSnaps` with -32601, and that is treated as "not applicable"
 * rather than an error - hard-failing here is what locked Rabby users out.
 *
 * Returns true when the Snap is present and usable.
 */
async function trySetupSnap(provider: Eip1193Provider): Promise<boolean> {
  let installed: Record<string, { id?: string }>;
  try {
    installed = (await provider.request({ method: "wallet_getSnaps" })) as Record<
      string,
      { id?: string }
    >;
  } catch {
    return false; // No Snaps support. Not fatal.
  }

  if (Object.values(installed ?? {}).some((s) => s?.id === GENLAYER_SNAP_ID)) return true;

  try {
    await provider.request({
      method: "wallet_requestSnaps",
      params: { [GENLAYER_SNAP_ID]: {} },
    });
    return true;
  } catch (error) {
    // A rejected Snap prompt must still surface as a rejection so the UI does
    // not claim success; anything else is downgraded to "unavailable".
    if ((error as { code?: unknown })?.code === 4001) {
      throw asWalletError(error, "Snap installation rejected.");
    }
    return false;
  }
}

async function readChainId(provider: Eip1193Provider): Promise<number | null> {
  try {
    const hex = (await provider.request({ method: "eth_chainId" })) as string;
    const parsed = Number.parseInt(hex, 16);
    return Number.isNaN(parsed) ? null : parsed;
  } catch {
    return null;
  }
}

// --------------------------------------------------------------------------- //
// Connect
// --------------------------------------------------------------------------- //

/**
 * Connect a specific injected wallet.
 *
 * @param walletId EIP-6963 uuid. Omit to use the only installed wallet; with
 *   several installed the caller must choose, so the user is never silently
 *   connected to an extension they did not pick.
 */
export async function connectInjected(walletId?: string): Promise<WalletSnapshot> {
  const wallets = listWallets();
  if (wallets.length === 0) {
    throw new WalletError("NO_PROVIDER", "No wallet extension detected.");
  }

  const chosen = walletId ? wallets.find((w) => w.id === walletId) : wallets[0];
  if (!chosen) throw new WalletError("NO_PROVIDER", "That wallet is no longer available.");

  let accounts: string[];
  try {
    accounts = (await chosen.provider.request({ method: "eth_requestAccounts" })) as string[];
  } catch (error) {
    throw asWalletError(error, "Wallet connection failed.");
  }
  if (!accounts?.length) {
    throw new WalletError("NO_ACCOUNTS", "No accounts were authorized.");
  }

  // Network and Snap are best-effort: a user rejection propagates, anything
  // else leaves the connection intact and is surfaced by the wrong-chain UI.
  try {
    await trySwitchChain(chosen.provider);
    await trySetupSnap(chosen.provider);
  } catch (error) {
    if (error instanceof WalletError && error.code === "USER_REJECTED") throw error;
  }

  const address = accounts[0] as `0x${string}`;
  activeProvider = chosen.provider;
  // An address string (rather than a local account object) is what makes
  // genlayer-js delegate signing to the injected provider.
  client = createClient({ chain: resolveChain(), account: address });
  safeSet(LAST_WALLET_KEY, chosen.id);

  return {
    status: "connected",
    address,
    chainId: (await readChainId(chosen.provider)) ?? getConfiguredChainId(),
    kind: "injected",
    walletName: chosen.name,
    walletId: chosen.id,
  };
}

/**
 * Connect an in-browser keypair.
 *
 * Offered only as a fallback when no extension is installed, and never
 * restored automatically - it must not stand in for a wallet the user meant to
 * use. The key is persisted so the same address is returned next time.
 */
export function connectSession(): WalletSnapshot {
  let key = safeGet(SESSION_KEY);
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
    key = generatePrivateKey() as string;
    safeSet(SESSION_KEY, key);
  }

  const account = createAccount(key as `0x${string}`);
  activeProvider = null;
  client = createClient({ chain: resolveChain(), account });
  safeSet(LAST_WALLET_KEY, "session");

  return {
    status: "connected",
    address: account.address as `0x${string}`,
    chainId: getConfiguredChainId(),
    kind: "session",
    walletName: null,
    walletId: null,
  };
}

/**
 * Silently restore a previous injected connection.
 *
 * Uses `eth_accounts`, which never prompts, so a user who revoked access
 * returns disconnected rather than seeing a stale address. The session wallet
 * is deliberately not restored: doing so previously left users connected to the
 * in-browser wallet with no obvious route to their extension.
 */
export async function restore(): Promise<WalletSnapshot | null> {
  const last = safeGet(LAST_WALLET_KEY);
  if (!last || last === "session") return null;

  const chosen = listWallets().find((w) => w.id === last);
  if (!chosen) return null;

  try {
    const accounts = (await chosen.provider.request({ method: "eth_accounts" })) as string[];
    if (!accounts?.length) return null;

    const address = accounts[0] as `0x${string}`;
    activeProvider = chosen.provider;
    client = createClient({ chain: resolveChain(), account: address });

    return {
      status: "connected",
      address,
      chainId: (await readChainId(chosen.provider)) ?? getConfiguredChainId(),
      kind: "injected",
      walletName: chosen.name,
      walletId: chosen.id,
    };
  } catch {
    // Restore is best-effort; failure just means "start disconnected".
    return null;
  }
}

/** Disconnect and reset local state. Never throws. */
export function disconnect(): void {
  client = null;
  activeProvider = null;
  safeRemove(LAST_WALLET_KEY);
}

/**
 * Subscribe to account and chain changes on the CONNECTED provider.
 *
 * Binding to the pinned provider rather than re-resolving one is what stops a
 * second installed extension from emitting events for a wallet the user is not
 * connected to.
 */
export function subscribeToActiveProvider(handlers: {
  onAccountsChanged: (accounts: string[]) => void;
  onChainChanged: (chainId: number) => void;
}): () => void {
  const provider = activeProvider;
  if (!provider?.on || !provider.removeListener) return () => {};

  const onAccounts = (...args: never[]) =>
    handlers.onAccountsChanged((args[0] as unknown as string[]) ?? []);
  const onChain = (...args: never[]) => {
    const parsed = Number.parseInt(args[0] as unknown as string, 16);
    if (!Number.isNaN(parsed)) handlers.onChainChanged(parsed);
  };

  provider.on("accountsChanged", onAccounts);
  provider.on("chainChanged", onChain);

  return () => {
    provider.removeListener?.("accountsChanged", onAccounts);
    provider.removeListener?.("chainChanged", onChain);
  };
}

/** Rebuild the client for a new address (after accountsChanged). */
export function adoptAddress(address: `0x${string}`): void {
  client = createClient({ chain: resolveChain(), account: address });
}

/** Ask the connected wallet to switch back to StudioNet. */
export async function switchToStudioNet(): Promise<void> {
  if (!activeProvider) throw new WalletError("NO_PROVIDER", "No wallet connected.");
  await trySwitchChain(activeProvider);
}
