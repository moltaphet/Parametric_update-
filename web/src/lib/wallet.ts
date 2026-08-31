/**
 * Wallet core - MetaMask (EIP-1193) only.
 *
 * The in-browser session wallet was removed. Signing now always goes through the
 * user's extension: genlayer-js routes `eth_sendTransaction` / `personal_sign`
 * to the injected provider when the client's `account` is an address string
 * rather than a local account object, which is what this module relies on.
 *
 * Signing GenVM transactions on a Studio chain additionally requires the
 * GenLayer MetaMask Snap. genlayer-js 1.1.8 does not export its Snap installer,
 * so `ensureGenLayerSnap` below performs the same `wallet_getSnaps` /
 * `wallet_requestSnaps` handshake directly.
 *
 * React bindings live in context/wallet.tsx; this module holds no React state.
 */

import { createClient } from "genlayer-js";
import * as chains from "genlayer-js/chains";
import type { GenLayerChain, GenLayerClient } from "genlayer-js/types";
import { NETWORK } from "./contract";

/**
 * Marks that the user connected before, so the app may silently re-check
 * authorization on load. Versioned so a format change can invalidate old state
 * rather than misread it.
 */
const PREFERENCE_KEY = "parametric.wallet.connector.v1";

/** Published id of the GenLayer wallet Snap. */
const GENLAYER_SNAP_ID = "npm:genlayer-wallet-plugin";

export type WalletStatus = "disconnected" | "connecting" | "connected";

export interface WalletSnapshot {
  status: WalletStatus;
  address: `0x${string}` | null;
  chainId: number | null;
}

export const DISCONNECTED: WalletSnapshot = {
  status: "disconnected",
  address: null,
  chainId: null,
};

// --------------------------------------------------------------------------- //
// Errors
//
// Every failure surfaces as a WalletError with a stable `code`, so the UI can
// branch on the code and never has to string-match a provider's message.
// --------------------------------------------------------------------------- //
export type WalletErrorCode =
  | "NO_PROVIDER"
  | "USER_REJECTED"
  | "REQUEST_PENDING"
  | "NO_ACCOUNTS"
  | "SNAP_UNSUPPORTED"
  | "UNKNOWN";

export class WalletError extends Error {
  readonly code: WalletErrorCode;

  constructor(code: WalletErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "WalletError";
    this.code = code;
  }
}

/** The subset of EIP-1193 this module uses. */
interface Eip1193Provider {
  request(args: { method: string; params?: unknown }): Promise<unknown>;
  on?(event: string, handler: (...args: never[]) => void): void;
  removeListener?(event: string, handler: (...args: never[]) => void): void;
}

/**
 * Translate an EIP-1193 rejection into a WalletError.
 *
 * 4001 and -32002 are the two codes that matter for a connect button: the user
 * closed the prompt, or a prompt is already open behind the browser window.
 * Both are normal user behavior, not faults.
 */
function toWalletError(error: unknown, fallback: string): WalletError {
  if (error instanceof WalletError) return error;
  const code = (error as { code?: unknown })?.code;
  if (code === 4001) {
    return new WalletError("USER_REJECTED", "Request was rejected in MetaMask.", {
      cause: error,
    });
  }
  if (code === -32002) {
    return new WalletError(
      "REQUEST_PENDING",
      "A MetaMask request is already open. Check the extension.",
      { cause: error }
    );
  }
  return new WalletError("UNKNOWN", fallback, { cause: error });
}

// --------------------------------------------------------------------------- //
// Provider discovery
// --------------------------------------------------------------------------- //

/** EIP-6963 provider announcement payload. */
interface Eip6963Detail {
  info: { uuid: string; name: string; icon: string; rdns: string };
  provider: Eip1193Provider;
}

const discovered = new Map<string, Eip6963Detail>();

/**
 * The active injected provider, if any.
 *
 * Prefers an EIP-6963 announcement over the legacy `window.ethereum` global:
 * with several wallets installed they fight over that global and the last one
 * to load wins, which is the problem EIP-6963 exists to solve.
 */
export function getInjectedProvider(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  const announced = discovered.values().next().value;
  if (announced) return announced.provider;
  return (window as { ethereum?: Eip1193Provider }).ethereum ?? null;
}

export function hasInjectedProvider(): boolean {
  return getInjectedProvider() !== null;
}

/** Display name of the detected wallet, e.g. "MetaMask". */
export function getInjectedProviderName(): string {
  const announced = discovered.values().next().value;
  if (announced) return announced.info.name;
  const legacy = (window as { ethereum?: { isMetaMask?: boolean } }).ethereum;
  return legacy?.isMetaMask ? "MetaMask" : "Browser wallet";
}

/**
 * Watch for an injected provider becoming available.
 *
 * Detection cannot be a one-shot check on mount: extensions inject
 * asynchronously, so a single probe often runs before MetaMask exists and then
 * never re-checks, permanently hiding the connect option. Three arrival paths
 * are covered - EIP-6963 announcements, the legacy `ethereum#initialized`
 * event, and a short bounded poll for wallets that do neither.
 */
export function subscribeToInjectedAvailability(
  onChange: (available: boolean) => void
): () => void {
  if (typeof window === "undefined") return () => {};

  let cancelled = false;
  const emit = () => {
    if (!cancelled) onChange(hasInjectedProvider());
  };

  const onAnnounce = (event: Event) => {
    const detail = (event as CustomEvent<Eip6963Detail>).detail;
    if (detail?.provider && detail?.info?.uuid) {
      discovered.set(detail.info.uuid, detail);
      emit();
    }
  };

  window.addEventListener("eip6963:announceProvider", onAnnounce);
  window.dispatchEvent(new Event("eip6963:requestProvider"));

  const onLegacyInit = () => emit();
  window.addEventListener("ethereum#initialized", onLegacyInit);

  emit();

  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    emit();
    if (hasInjectedProvider() || attempts >= 10) clearInterval(timer);
  }, 300);

  return () => {
    cancelled = true;
    window.removeEventListener("eip6963:announceProvider", onAnnounce);
    window.removeEventListener("ethereum#initialized", onLegacyInit);
    clearInterval(timer);
  };
}

// --------------------------------------------------------------------------- //
// Storage (guarded)
//
// localStorage can throw rather than return null - Safari private mode and some
// embedded webviews raise SecurityError on access - so every call is wrapped.
// A hostile storage environment degrades to a per-page-load session.
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
// Live client
//
// Module scope rather than React state: a viem client is not renderable, and
// holding it in state causes needless re-renders.
// --------------------------------------------------------------------------- //
let walletClient: GenLayerClient<GenLayerChain> | null = null;

export function getWalletClient(): GenLayerClient<GenLayerChain> | null {
  return walletClient;
}

/** Throwing accessor for write paths that require a connected wallet. */
export function requireWalletClient(): GenLayerClient<GenLayerChain> {
  if (!walletClient) {
    throw new WalletError("NO_ACCOUNTS", "Connect MetaMask to sign transactions.");
  }
  return walletClient;
}

// --------------------------------------------------------------------------- //
// Network and Snap provisioning
// --------------------------------------------------------------------------- //

/**
 * Point the wallet at GenLayer StudioNet, adding the network if unknown.
 *
 * Without this the extension stays on whatever chain it was already on and
 * every signed transaction targets the wrong network.
 * `wallet_switchEthereumChain` fails with 4902 when the chain has never been
 * added, which is the signal to add it first and then switch.
 */
async function ensureStudioNetChain(provider: Eip1193Provider): Promise<void> {
  const chain = resolveChain();
  const chainIdHex = `0x${Number(chain.id).toString(16)}`;

  let current: string | null = null;
  try {
    current = (await provider.request({ method: "eth_chainId" })) as string;
  } catch {
    // A provider that cannot report its chain also cannot switch; let the
    // connection proceed and fail loudly at signing time instead.
    return;
  }
  if (current?.toLowerCase() === chainIdHex.toLowerCase()) return;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
  } catch (error) {
    // 4902: unrecognized chain. Some wallets wrap it as -32603.
    const code = (error as { code?: unknown })?.code;
    if (code !== 4902 && code !== -32603) {
      throw toWalletError(error, "Could not switch MetaMask to StudioNet.");
    }
    try {
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
    } catch (addError) {
      throw toWalletError(addError, "Could not add StudioNet to MetaMask.");
    }
  }
}

/**
 * Ensure the GenLayer Snap is installed.
 *
 * MetaMask cannot sign GenVM transactions on its own - the Snap supplies that
 * capability. This performs the same handshake genlayer-js does internally
 * (its version is not exported): list installed snaps, and request installation
 * only when missing, so a returning user is not prompted on every connect.
 *
 * A wallet without Snaps support reports an unknown method; that is surfaced as
 * SNAP_UNSUPPORTED so the UI can explain the requirement rather than failing
 * later at signing time with an opaque error.
 */
async function ensureGenLayerSnap(provider: Eip1193Provider): Promise<void> {
  let installed: Record<string, { id?: string }> = {};
  try {
    installed = (await provider.request({ method: "wallet_getSnaps" })) as Record<
      string,
      { id?: string }
    >;
  } catch (error) {
    const code = (error as { code?: unknown })?.code;
    // -32601 method not found: this wallet has no Snaps support at all.
    if (code === -32601) {
      throw new WalletError(
        "SNAP_UNSUPPORTED",
        "This wallet does not support MetaMask Snaps, which GenLayer needs for signing."
      );
    }
    throw toWalletError(error, "Could not read installed MetaMask Snaps.");
  }

  const present = Object.values(installed ?? {}).some(
    (snap) => snap?.id === GENLAYER_SNAP_ID
  );
  if (present) return;

  try {
    await provider.request({
      method: "wallet_requestSnaps",
      params: { [GENLAYER_SNAP_ID]: {} },
    });
  } catch (error) {
    throw toWalletError(error, "Could not install the GenLayer MetaMask Snap.");
  }
}

// --------------------------------------------------------------------------- //
// Connect
// --------------------------------------------------------------------------- //

/**
 * @param interactive When true, prompt the user (`eth_requestAccounts`), align
 *   the network, and provision the Snap. When false, only read
 *   already-authorized accounts (`eth_accounts`) and prompt for nothing -
 *   silent restore on page load must never open a wallet dialog.
 */
async function connectInjected(interactive: boolean): Promise<WalletSnapshot> {
  const provider = getInjectedProvider();
  if (!provider) {
    throw new WalletError(
      "NO_PROVIDER",
      "MetaMask was not detected in this browser."
    );
  }

  let accounts: string[];
  try {
    accounts = (await provider.request({
      method: interactive ? "eth_requestAccounts" : "eth_accounts",
    })) as string[];
  } catch (error) {
    throw toWalletError(error, "MetaMask connection failed.");
  }

  if (!accounts || accounts.length === 0) {
    throw new WalletError("NO_ACCOUNTS", "No accounts are authorized in MetaMask.");
  }

  if (interactive) {
    await ensureStudioNetChain(provider);
    await ensureGenLayerSnap(provider);
  }

  const address = accounts[0] as `0x${string}`;
  // Passing the address as a string (not an account object) is what makes
  // genlayer-js delegate signing to the injected provider.
  walletClient = createClient({ chain: resolveChain(), account: address });
  safeSet(PREFERENCE_KEY, "injected");

  let chainId: number | null = null;
  try {
    const hex = (await provider.request({ method: "eth_chainId" })) as string;
    const parsed = Number.parseInt(hex, 16);
    chainId = Number.isNaN(parsed) ? null : parsed;
  } catch {
    chainId = null;
  }

  return {
    status: "connected",
    address,
    chainId: chainId ?? getConfiguredChainId(),
  };
}

/** Connect explicitly, in response to a user gesture. */
export function connect(): Promise<WalletSnapshot> {
  return connectInjected(true);
}

/**
 * Restore a previous connection on page load, without prompting.
 *
 * Returns null when there is nothing to restore, which is the normal
 * first-visit path and is not an error. Authorization is re-checked with
 * `eth_accounts`, so a user who revoked access in MetaMask correctly comes back
 * disconnected instead of seeing a stale address.
 */
export async function restore(): Promise<WalletSnapshot | null> {
  if (!safeGet(PREFERENCE_KEY)) return null;

  try {
    if (!hasInjectedProvider()) {
      // The extension was uninstalled or disabled since the last visit.
      safeRemove(PREFERENCE_KEY);
      return null;
    }
    return await connectInjected(false);
  } catch {
    // Restore is best-effort: any failure means "start disconnected", never a
    // thrown error into a page-load effect.
    safeRemove(PREFERENCE_KEY);
    return null;
  }
}

/**
 * Disconnect and reset local state.
 *
 * Synchronous, total, and never throws. Note that a dApp cannot revoke its own
 * permission in MetaMask - only the user can, from the extension - so this
 * clears *our* session and reconnecting may not re-prompt. That is expected
 * EIP-1193 behavior, and the UI says so.
 */
export function disconnect(): void {
  walletClient = null;
  safeRemove(PREFERENCE_KEY);
}

/**
 * Subscribe to account and chain changes.
 *
 * Returns an unsubscribe function. Safe to call with no provider present, in
 * which case it is a no-op, so callers need no branching.
 */
export function subscribeToProvider(handlers: {
  onAccountsChanged: (accounts: string[]) => void;
  onChainChanged: (chainId: number) => void;
}): () => void {
  const provider = getInjectedProvider();
  if (!provider?.on || !provider.removeListener) return () => {};

  const accountsHandler = (...args: never[]) => {
    handlers.onAccountsChanged((args[0] as unknown as string[]) ?? []);
  };
  const chainHandler = (...args: never[]) => {
    const parsed = Number.parseInt(args[0] as unknown as string, 16);
    if (!Number.isNaN(parsed)) handlers.onChainChanged(parsed);
  };

  provider.on("accountsChanged", accountsHandler);
  provider.on("chainChanged", chainHandler);

  return () => {
    provider.removeListener?.("accountsChanged", accountsHandler);
    provider.removeListener?.("chainChanged", chainHandler);
  };
}

/** Rebuild the client for a new address (after accountsChanged). */
export function adoptInjectedAddress(address: `0x${string}`): void {
  walletClient = createClient({ chain: resolveChain(), account: address });
}

/** Ask MetaMask to switch back to StudioNet, for the wrong-chain UI. */
export async function switchToStudioNet(): Promise<void> {
  const provider = getInjectedProvider();
  if (!provider) throw new WalletError("NO_PROVIDER", "MetaMask was not detected.");
  await ensureStudioNetChain(provider);
}
