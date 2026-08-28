// Formatting helpers for on-chain amounts (wei / atto-scale), timestamps,
// and policy lifecycle presentation. 1 GEN = 10 ** 18 wei.

const WEI_PER_GEN = 10n ** 18n;

/** Convert a wei amount (bigint, number, or decimal string) into a GEN string. */
export function weiToGen(wei: bigint | string | number, maxFractionDigits = 4): string {
  let value: bigint;
  try {
    value = typeof wei === "bigint" ? wei : BigInt(String(wei).split(".")[0] || "0");
  } catch {
    return "0";
  }
  const whole = value / WEI_PER_GEN;
  const remainder = value % WEI_PER_GEN;
  if (remainder === 0n) return formatGroups(whole.toString());

  // Build the fractional part, padded to 18 digits, then trim to precision.
  let frac = remainder.toString().padStart(18, "0").slice(0, maxFractionDigits);
  frac = frac.replace(/0+$/, "");
  return frac.length > 0
    ? `${formatGroups(whole.toString())}.${frac}`
    : formatGroups(whole.toString());
}

/** Convert a human GEN string (e.g. "1.5") into an exact wei bigint. */
export function genToWei(gen: string): bigint {
  const trimmed = gen.trim();
  if (trimmed === "") return 0n;
  const [wholePart, fracPartRaw = ""] = trimmed.split(".");
  const fracPart = fracPartRaw.slice(0, 18).padEnd(18, "0");
  const whole = BigInt(wholePart || "0");
  const frac = BigInt(fracPart || "0");
  return whole * WEI_PER_GEN + frac;
}

/** Insert thousands separators into an integer string. */
function formatGroups(intStr: string): string {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Format a wei amount with a trailing GEN unit. */
export function formatGen(wei: bigint | string | number, digits = 4): string {
  return `${weiToGen(wei, digits)} GEN`;
}

/** Shorten a 0x address for display. */
export function shortAddress(address: string | undefined | null): string {
  if (!address) return "-";
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/** Render a unix-seconds timestamp as a readable UTC datetime. */
export function formatTimestamp(tsSeconds: number | string | undefined): string {
  const ts = Number(tsSeconds);
  if (!ts || Number.isNaN(ts)) return "-";
  const d = new Date(ts * 1000);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

/** Human-friendly relative time from now (e.g. "in 3 days", "5 hours ago"). */
export function relativeTime(tsSeconds: number | string | undefined): string {
  const ts = Number(tsSeconds);
  if (!ts || Number.isNaN(ts)) return "";
  const deltaSec = ts - Math.floor(Date.now() / 1000);
  const abs = Math.abs(deltaSec);
  const units: [number, string][] = [
    [60, "second"],
    [3600, "minute"],
    [86400, "hour"],
    [604800, "day"],
    [2629800, "week"],
  ];
  let unitLabel = "day";
  let value = Math.round(abs / 86400);
  for (let i = 0; i < units.length - 1; i++) {
    if (abs < units[i + 1][0]) {
      unitLabel = units[i][1];
      value = Math.round(abs / units[i][0]);
      break;
    }
  }
  const plural = value === 1 ? "" : "s";
  return deltaSec >= 0
    ? `in ${value} ${unitLabel}${plural}`
    : `${value} ${unitLabel}${plural} ago`;
}

/** Convert a datetime-local input value into an ISO-8601 UTC string. */
export function localInputToIso(localValue: string): string {
  if (!localValue) return "";
  // datetime-local has no timezone; treat it as UTC to match contract parsing.
  const withZone = localValue.length === 16 ? `${localValue}:00Z` : `${localValue}Z`;
  return withZone;
}
