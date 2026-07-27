export function truncateAddress(address: string, chars = 4): string {
  if (!address) return "";
  return `${address.slice(0, 2 + chars)}...${address.slice(-chars)}`;
}

export function formatTokenAmount(value: bigint, decimals: number, maxFractionDigits = 4): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = value / divisor;
  const fraction = value % divisor;
  if (fraction === 0n) return whole.toLocaleString("en-US");
  const fractionStr = fraction
    .toString()
    .padStart(decimals, "0")
    .slice(0, maxFractionDigits)
    .replace(/0+$/, "");
  return fractionStr ? `${whole.toLocaleString("en-US")}.${fractionStr}` : whole.toLocaleString("en-US");
}

export function parseTokenAmount(value: string, decimals: number): bigint {
  const [whole = "0", fraction = ""] = value.trim().split(".");
  const paddedFraction = fraction.padEnd(decimals, "0").slice(0, decimals);
  const wholeDigits = whole === "" ? "0" : whole;
  return BigInt(wholeDigits) * 10n ** BigInt(decimals) + BigInt(paddedFraction || "0");
}

export function formatCountdown(targetSeconds: number, nowSeconds: number): string {
  const diff = targetSeconds - nowSeconds;
  if (diff <= 0) return "Expired";
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  const seconds = Math.floor(diff % 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function formatUnixTimestamp(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// FTSO feed IDs: 1-byte category prefix + ASCII feed name, zero-padded to
// 21 bytes total. Category 0x01 = Crypto. See Flare FTSOv2 docs for the
// full category list.
export function encodeFeedId(symbol: string, category = 0x01): `0x${string}` {
  const nameBytes = new TextEncoder().encode(symbol);
  if (nameBytes.length > 20) throw new Error("feed symbol too long (max 20 bytes)");
  const buf = new Uint8Array(21);
  buf[0] = category;
  buf.set(nameBytes, 1);
  return `0x${Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}` as `0x${string}`;
}

export const COMMON_FEEDS = ["BTC/USD", "ETH/USD", "FLR/USD", "XRP/USD"] as const;

export const WEATHER_CITIES = [
  { name: "Taipei", lat: 25.033, lon: 121.565 },
  { name: "Tokyo", lat: 35.689, lon: 139.692 },
  { name: "New York", lat: 40.713, lon: -74.006 },
  { name: "Seoul", lat: 37.566, lon: 126.978 },
  { name: "Bangkok", lat: 13.756, lon: 100.502 },
  { name: "London", lat: 51.507, lon: -0.128 },
] as const;

export const RAIN_THRESHOLD_PRESETS_MM = [1, 5, 10, 25] as const;

export const DURATION_PRESETS_HOURS = [
  { label: "1 hour", hours: 1 },
  { label: "6 hours", hours: 6 },
  { label: "24 hours", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "7 days", hours: 168 },
] as const;
