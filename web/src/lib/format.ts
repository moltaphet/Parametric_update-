/**
 * Formatting helpers for on-chain values.
 *
 * Every amount the contract returns is a decimal string of wei (atto-scale,
 * 1 GEN = 10^18 wei). These are parsed with BigInt rather than Number: a
 * 12 GEN payout is 1.2e19, which is far past Number.MAX_SAFE_INTEGER and would
 * silently lose precision.
 */

const WEI_PER_GEN = 10n ** 18n;

/** Parse a wei string defensively; malformed input reads as zero. */
export function toWei(value: string | number | bigint | null | undefined): bigint {
  if (value === null || value === undefined) return 0n;
  try {
    return BigInt(typeof value === "string" ? value.trim() || "0" : value);
  } catch {
    return 0n;
  }
}

/**
 * Render wei as a GEN string with a fixed number of decimals.
 *
 * The fractional part is produced by integer division so no floating point is
 * involved at any point.
 */
export function formatGen(
  value: string | number | bigint | null | undefined,
  decimals = 2
): string {
  const wei = toWei(value);
  const whole = wei / WEI_PER_GEN;
  const remainder = wei % WEI_PER_GEN;

  if (decimals <= 0) return whole.toString();

  const fraction = (remainder * 10n ** BigInt(decimals)) / WEI_PER_GEN;
  const padded = fraction.toString().padStart(decimals, "0");
  return `${whole.toString()}.${padded}`;
}

/** Render wei as GEN with a unit suffix, e.g. "12.00 GEN". */
export function formatGenWithUnit(
  value: string | number | bigint | null | undefined,
  decimals = 2
): string {
  return `${formatGen(value, decimals)} GEN`;
}

/** Compact large counts for the stats ticker: 1200 -> "1.2K". */
export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) < 1000) return value.toString();
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/**
 * Parse a decimal GEN string into wei.
 *
 * Done with string manipulation rather than `Number(value) * 1e18`: the float
 * path silently corrupts anything past ~15 significant digits, so a premium of
 * "0.1" becomes 100000000000000010 wei instead of 100000000000000000. The
 * contract compares exact integers, so that matters.
 *
 * @throws RangeError on malformed input, so callers can show a field error
 *   rather than silently submitting zero.
 */
export function genToWei(value: string): bigint {
  const trimmed = value.trim();
  if (trimmed === "") return 0n;
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === ".") {
    throw new RangeError("Amount must be a positive decimal number");
  }

  const [whole = "", fraction = ""] = trimmed.split(".");
  if (fraction.length > 18) {
    throw new RangeError("Amount has more than 18 decimal places");
  }

  // Right-pad the fraction to exactly 18 digits so it lines up with wei.
  const padded = fraction.padEnd(18, "0");
  return BigInt(whole || "0") * WEI_PER_GEN + BigInt(padded || "0");
}

/**
 * Convert a `datetime-local` input value into the UTC ISO string the contract
 * parses.
 *
 * `datetime-local` yields a wall-clock string with no zone, which `new Date()`
 * interprets in the browser's local zone. Converting through `toISOString()` is
 * what makes a user in UTC+9 and a user in UTC-5 submit the same instant for the
 * same real departure. The milliseconds are dropped for a cleaner stored value.
 */
export function localInputToIso(local: string): string {
  const date = new Date(local);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("Invalid departure date");
  }
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Shorten an address for display: 0x8Ed1...D896. */
export function shortenAddress(address: string | null | undefined): string {
  if (!address || address.length < 10) return address ?? "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
