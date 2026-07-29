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
  const nameBytes = new TextEncoder().encode(symbol.toUpperCase().trim());
  if (nameBytes.length > 20) throw new Error("feed symbol too long (max 20 bytes)");
  const buf = new Uint8Array(21);
  buf[0] = category;
  buf.set(nameBytes, 1);
  return `0x${Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}` as `0x${string}`;
}

export const COMMON_FEEDS = ["BTC/USD", "ETH/USD", "FLR/USD", "XRP/USD"] as const;

/** Full list of feeds served by Flare's FTSOv2 block-latency feed set (standard crypto feeds +
 * the sFLR/stXRP custom feeds), used to give the Custom feed input a combobox + "unrecognized
 * feed" warning instead of letting the user type anything blind. Source: dev.flare.network/ftso/feeds. */
export const FTSO_FEEDS = [
  "FLR/USD", "SGB/USD", "BTC/USD", "XRP/USD", "LTC/USD", "XLM/USD",
  "DOGE/USD", "ADA/USD", "ALGO/USD", "ETH/USD", "FIL/USD", "ARB/USD",
  "AVAX/USD", "BNB/USD", "POL/USD", "SOL/USD", "USDC/USD", "USDT/USD",
  "XDC/USD", "TRX/USD", "LINK/USD", "ATOM/USD", "DOT/USD", "TON/USD",
  "ICP/USD", "SHIB/USD", "USDS/USD", "BCH/USD", "NEAR/USD", "LEO/USD",
  "UNI/USD", "ETC/USD", "WIF/USD", "BONK/USD", "JUP/USD", "ETHFI/USD",
  "ENA/USD", "PYTH/USD", "HNT/USD", "SUI/USD", "PEPE/USD", "QNT/USD",
  "AAVE/USD", "S/USD", "ONDO/USD", "TAO/USD", "FET/USD", "RENDER/USD",
  "NOT/USD", "RUNE/USD", "TRUMP/USD", "USDX/USD", "HBAR/USD", "PENGU/USD",
  "HYPE/USD", "APT/USD", "PAXG/USD", "BERA/USD", "OP/USD", "PUMP/USD",
  "XPL/USD", "MON/USD", "NIGHT/USD", "sFLR/USD", "stXRP/USD",
] as const;

export const WEATHER_CITIES = [
  { name: "Taipei", lat: 25.033, lon: 121.565 },
  { name: "Tokyo", lat: 35.689, lon: 139.692 },
  { name: "New York", lat: 40.713, lon: -74.006 },
  { name: "Seoul", lat: 37.566, lon: 126.978 },
  { name: "Bangkok", lat: 13.756, lon: 100.502 },
  { name: "London", lat: 51.507, lon: -0.128 },
] as const;

/** Reverse-looks-up a WEATHER market's on-chain lat/lon (1e6-scaled) against WEATHER_CITIES —
 * exact match only (createMarket stores whatever the create form sent verbatim), falls back to
 * undefined for custom coordinates so callers can show formatted lat/lon instead. */
export function findCityName(latE6: bigint, lonE6: bigint): string | undefined {
  const lat = Number(latE6) / 1e6;
  const lon = Number(lonE6) / 1e6;
  const match = WEATHER_CITIES.find((c) => Math.abs(c.lat - lat) < 1e-4 && Math.abs(c.lon - lon) < 1e-4);
  return match?.name;
}

/** Preset temperature-bucket templates for the WEATHER create-market form — ascending °C x100
 * breakpoints matching PredictionMarket.sol's `bucketThresholds` (N thresholds -> N+1 buckets). */
export const BUCKET_TEMPLATES = [
  { name: "Summer", thresholds: [2500, 2800, 3100, 3400], hint: "<25 / 25–28 / 28–31 / 31–34 / >34°C" },
  { name: "Mild", thresholds: [1500, 2000, 2500, 3000], hint: "<15 / 15–20 / 20–25 / 25–30 / >30°C" },
  { name: "Winter", thresholds: [0, 500, 1000, 1500], hint: "<0 / 0–5 / 5–10 / 10–15 / >15°C" },
] as const;

export const DURATION_PRESETS_HOURS = [
  { label: "1 hour", hours: 1 },
  { label: "6 hours", hours: 6 },
  { label: "24 hours", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "7 days", hours: 168 },
] as const;
