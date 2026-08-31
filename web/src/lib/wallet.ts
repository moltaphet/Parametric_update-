/**
 * Wallet core - framework-free.
 *
 * Two connectors are supported, because GenLayer has two genuinely different
 * signing stories and neither one covers every user:
 *
 *   session  - a keypair generated in the browser and kept in localStorage.
 *              Requires no extension at all. StudioNet is gasless, so a fresh
 *              account with a zero balance can still deploy and transact. This
 *              is the proven path and the default.
 *
 *   injected - an EIP-1193 provider (window.ethereum). genlayer-js routes
 *              eth_sendTransaction / personal_sign to the provider when the
 *              client's `account` is an address string rather than an account
 *              object, which is what this connector relies on.
 *
 * IMPORTANT: on a Studio chain, submitting GenVM transactions through an
 * injected wallet additionally requires the GenLayer MetaMask Snap. genlayer-js
 * 1.1.8 does not export its Snap installer, so the injected connector here is
 * offered only when a provider is actually present and is not the default. If
 * you are targeting StudioNet, session is the connector that works end to end.
 *
 * React bindings live in context/wallet.tsx; this module holds no React state so
 * it can be unit tested and reused.
 */

import { createAccount, createClient, generatePrivateKey } from "genlayer-js";
import * as chains from "genlayer-js/chains";
import type { GenLayerChain, GenLayerClient } from "genlayer-js/types";
import { NETWORK } from "./contract";

// --------------------------------------------------------------------------- //
// Storage keys. Versioned so a future format change can invalidate old state
// instead of trying to read it and failing in a confusing way.
// --------------------------------------------------------------------------- //
const SESSION_KEY = "parametric.wallet.sessionKey.v1";
const PREFERENCE_KEY = "parametric.wallet.connector.v1";

export type ConnectorKind = "session" | "injected";

export type WalletStatus = "disconnected" | "connecting" | "connected";

export interface WalletSnapshot {
  status: WalletStatus;
  address: `0x${string}` | null;
  chainId: number | null;
  connector: ConnectorKind | null;
}

export const DISCONNECTED: WalletSnapshot = {
  status: "disconnected",
  address: null,
  chainId: null,
  connector: null,
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
  | "STORAGE_UNAVAILABLE"
  | "UNKNOWN";

export class WalletError extends Error {
  readonly code: WalletErrorCode;

  constructor(code: WalletErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "WalletError";
    this.code = code;
  }
}

/** Shape of the subset of EIP-1193 this module uses. */
interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, handler: (...args: never[]) => void): void;
  removeListener?(event: string, handler: (...args: never[]) => void): void;
}

/**
 * Translate an EIP-1193 rejection into a WalletError.
 *
 * 4001 and -32002 are the two codes that matter for a connect button: the user
 * closed the prompt, or a prompt is already open behind the browser window. Both
 * are normal user behavior, not faults, and must not surface as a crash.
 */
function toWalletError(error: unknown, fallback: string): WalletError {
  const code = (error as { code?: unknown })?.code;
  if (code === 4001) {
    return new WalletError("USER_REJECTED", "Connection request was rejected.", {
      cause: error,
    });
  }
  if (code === -32002) {
    return new WalletError(
      "REQUEST_PENDING",
      "A connection request is already open. Check your wallet extension.",
      { cause: error }
    );
  }
  if (error instanceof WalletError) return error;
  return new WalletError("UNKNOWN", fallback, { cause: error });
}

// --------------------------------------------------------------------------- //
// Environment probes
// --------------------------------------------------------------------------- //
/** EIP-6963 provider announcement payload. */
interface Eip6963Detail {
  info: { uuid: string; name: string; icon: string; rdns: string };
  provider: Eip1193Provider;
}

// Providers announced via EIP-6963. Keyed by uuid so a wallet that announces
// more than once does not appear twice.
const discovered = new Map<string, Eip6963Detail>();

/**
 * The active injected provider, if any.
 *
 * Prefers an EIP-6963 announcement over the legacy `window.ethereum` global.
 * With several wallets installed they fight over that global, and the last one
 * to load wins; EIP-6963 is the standard that fixed this.
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
 * Detection cannot be a one-shot check on mount. Extensions inject
 * asynchronously, so a single probe frequently runs *before* MetaMask has
 * installed itself and then never re-checks - which silently removes the wallet
 * option from the UI for the rest of the session. Three mechanisms are covered:
 *
 *   1. EIP-6963 announcements (the modern standard, and the only correct way to
 *      handle multiple installed wallets);
 *   2. the legacy `ethereum#initialized` event;
 *   3. a short bounded poll, for wallets that do neither.
 *
 * Returns an unsubscribe function.
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
  // Ask any already-loaded wallet to announce itself.
  window.dispatchEvent(new Event("eip6963:requestProvider"));

  const onLegacyInit = () => emit();
  window.addEventListener("ethereum#initialized", onLegacyInit);

  emit();

  // Bounded fallback poll: ~3s, stops as soon as a provider appears.
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

/**
 * localStorage can throw, not just return null: Safari private mode and
 * embedded webviews raise SecurityError on access. Every read and write here is
 * guarded so a hostile storage environment degrades to an in-memory session
 * rather than breaking the page.
 */
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
    /* non-fatal: the session still works for this page load */
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
// Held in module scope rather than React state: it is not renderable, and
// putting a viem client in state causes needless re-renders and deep-compare
// problems. The context mirrors only the serializable snapshot.
// --------------------------------------------------------------------------- //
let walletClient: GenLayerClient<GenLayerChain> | null = null;

/** The signing client, or null when disconnected. */
export function getWalletClient(): GenLayerClient<GenLayerChain> | null {
  return walletClient;
}

/** Throwing accessor for write paths that require a connected wallet. */
export function requireWalletClient(): GenLayerClient<GenLayerChain> {
  if (!walletClient) {
    throw new WalletError("NO_ACCOUNTS", "Connect a wallet to sign transactions.");
  }
  return walletClient;
}

// --------------------------------------------------------------------------- //
// Session connector
// --------------------------------------------------------------------------- //
function readSessionKey(): `0x${string}` | null {
  const stored = safeGet(SESSION_KEY);
  // Validate before use: a truncated or tampered value would otherwise throw
  // deep inside key derivation with an opaque message.
  return stored && /^0x[0-9a-fA-F]{64}$/.test(stored)
    ? (stored as `0x${string}`)
    : null;
}

/** True when a previous session key exists, i.e. the user connected before. */
export function hasSessionKey(): boolean {
  return readSessionKey() !== null;
}

function connectSession(): WalletSnapshot {
  let key = readSessionKey();
  if (!key) {
    key = generatePrivateKey() as `0x${string}`;
    safeSet(SESSION_KEY, key);
  }

  const account = createAccount(key);
  walletClient = createClient({ chain: resolveChain(), account });
  safeSet(PREFERENCE_KEY, "session");

  return {
    status: "connected",
    address: account.address as `0x${string}`,
    chainId: getConfiguredChainId(),
    connector: "session",
  };
}

// --------------------------------------------------------------------------- //
// Injected connector
// --------------------------------------------------------------------------- //
async function readInjectedChainId(provider: Eip1193Provider): Promise<number | null> {
  try {
    const hex = (await provider.request({ method: "eth_chainId" })) as string;
    const parsed = Number.parseInt(hex, 16);
    return Number.isNaN(parsed) ? null : parsed;
  } catch {
    // A provider that cannot report its chain is still usable for signing;
    // surface null rather than failing the whole connection.
    return null;
  }
}

/**
 * Point the wallet at GenLayer StudioNet, adding the network if it is unknown.
 *
 * Without this the extension stays on whatever chain it was already on, and
 * every signed transaction targets the wrong network. `wallet_switchEthereumChain`
 * fails with 4902 when the chain has never been added, which is the signal to
 * add it first and then switch.
 *
 * Failures here are surfaced rather than swallowed: a wallet on the wrong chain
 * is not a usable connection.
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
      throw toWalletError(error, "Could not switch the wallet to StudioNet.");
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
      throw toWalletError(addError, "Could not add StudioNet to the wallet.");
    }
  }
}

/**
 * @param interactive When true, prompt the user (eth_requestAccounts) and align
 *   the wallet's network. When false, only read already-authorized accounts
 *   (eth_accounts) and never prompt - silent restore on page load must not open
 *   a wallet dialog, which is the whole reason for this flag.
 */
async function connectInjected(interactive: boolean): Promise<WalletSnapshot> {
  const provider = getInjectedProvider();
  if (!provider) {
    throw new WalletError(
      "NO_PROVIDER",
      "No wallet extension detected in this browser."
    );
  }

  let accounts: string[];
  try {
    accounts = (await provider.request({
      method: interactive ? "eth_requestAccounts" : "eth_accounts",
    })) as string[];
  } catch (error) {
    throw toWalletError(error, "Wallet connection failed.");
  }

  if (!accounts || accounts.length === 0) {
    throw new WalletError("NO_ACCOUNTS", "No accounts are authorized in the wallet.");
  }

  // Only align the network on an explicit user-initiated connect. Doing it
  // during silent restore would pop a wallet dialog on every page load.
  if (interactive) await ensureStudioNetChain(provider);

  const address = accounts[0] as `0x${string}`;
  // Passing the address as a string (not an account object) is what makes
  // genlayer-js delegate signing to the injected provider.
  walletClient = createClient({ chain: resolveChain(), account: address });
  safeSet(PREFERENCE_KEY, "injected");

  return {
    status: "connected",
    address,
    chainId: (await readInjectedChainId(provider)) ?? getConfiguredChainId(),
    connector: "injected",
  };
}

// --------------------------------------------------------------------------- //
// Public API
// --------------------------------------------------------------------------- //

/** Connect explicitly, in response to a user gesture. */
export async function connect(kind: ConnectorKind): Promise<WalletSnapshot> {
  if (kind === "injected") return connectInjected(true);
  return connectSession();
}

/**
 * Restore a previous session on page load, without prompting.
 *
 * Returns null when there is nothing to restore, which is the normal
 * first-visit path and is not an error. For the injected connector this checks
 * `eth_accounts`, so a user who revoked access in their wallet correctly comes
 * back disconnected instead of seeing a stale address.
 */
export async function restore(): Promise<WalletSnapshot | null> {
  const preference = safeGet(PREFERENCE_KEY) as ConnectorKind | null;
  if (!preference) return null;

  try {
    if (preference === "injected") {
      if (!hasInjectedProvider()) {
        // The extension was uninstalled or disabled since the last visit.
        clearPersistedPreference();
        return null;
      }
      return await connectInjected(false);
    }

    if (!hasSessionKey()) {
      clearPersistedPreference();
      return null;
    }
    return connectSession();
  } catch {
    // Restore is best-effort by definition. Any failure means "start
    // disconnected", never a thrown error into a page-load effect.
    clearPersistedPreference();
    return null;
  }
}

function clearPersistedPreference(): void {
  safeRemove(PREFERENCE_KEY);
}

/**
 * Disconnect and reset all local state.
 *
 * Deliberately synchronous and total: it drops the client, forgets the
 * connector preference, and never throws. Note that a dApp cannot revoke its own
 * permission in an injected wallet - only the user can, from the wallet UI - so
 * for the injected connector this clears *our* session, and reconnecting may not
 * re-prompt. That is expected EIP-1193 behavior, and the UI says so.
 *
 * @param options.forgetSessionKey When true, also destroys the stored session
 *   keypair. That is irreversible: the address changes on next connect and any
 *   funds or policies tied to the old address are no longer reachable from this
 *   browser. Off by default so a normal disconnect is non-destructive.
 */
export function disconnect(options: { forgetSessionKey?: boolean } = {}): void {
  walletClient = null;
  clearPersistedPreference();
  if (options.forgetSessionKey) safeRemove(SESSION_KEY);
}

/**
 * Rotate to a brand-new session account.
 *
 * Only meaningful for the session connector; the injected connector's account
 * is controlled by the wallet, not by us.
 */
export function rotateSessionAccount(): WalletSnapshot {
  safeRemove(SESSION_KEY);
  walletClient = null;
  return connectSession();
}

/**
 * Subscribe to injected-provider account and chain changes.
 *
 * Returns an unsubscribe function. Safe to call when no provider exists, in
 * which case it is a no-op - so the caller needs no branching.
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

/** Rebuild the client for a new injected address (after accountsChanged). */
export function adoptInjectedAddress(address: `0x${string}`): void {
  walletClient = createClient({ chain: resolveChain(), account: address });
}
