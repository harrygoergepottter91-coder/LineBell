export const INTERVALS = ["1m", "5m", "15m", "1h"] as const;
export type Interval = (typeof INTERVALS)[number];

const CRYPTO = [
  { symbol: "BTCUSD", name: "Bitcoin", short: "BTC", venue: "coinbase", product: "BTC-USD", yahoo: "", digits: 2 },
  { symbol: "ETHUSD", name: "Ether", short: "ETH", venue: "coinbase", product: "ETH-USD", yahoo: "", digits: 2 },
  { symbol: "SOLUSD", name: "Solana", short: "SOL", venue: "coinbase", product: "SOL-USD", yahoo: "", digits: 2 },
  { symbol: "BNBUSD", name: "BNB", short: "BNB", venue: "coinbase", product: "BNB-USD", yahoo: "", digits: 2 },
  { symbol: "XRPUSD", name: "XRP", short: "XRP", venue: "coinbase", product: "XRP-USD", yahoo: "", digits: 4 },
  { symbol: "DOGEUSD", name: "Dogecoin", short: "DOGE", venue: "coinbase", product: "DOGE-USD", yahoo: "", digits: 5 },
  { symbol: "ADAUSD", name: "Cardano", short: "ADA", venue: "coinbase", product: "ADA-USD", yahoo: "", digits: 4 },
  { symbol: "AVAXUSD", name: "Avalanche", short: "AVAX", venue: "coinbase", product: "AVAX-USD", yahoo: "", digits: 2 },
  { symbol: "LINKUSD", name: "Chainlink", short: "LINK", venue: "coinbase", product: "LINK-USD", yahoo: "", digits: 2 },
] as const;

const FOREX = [
  { symbol: "EURUSD", name: "Euro", short: "EURUSD", venue: "yahoo", yahoo: "EURUSD=X", digits: 5 },
  { symbol: "GBPUSD", name: "Sterling", short: "GBPUSD", venue: "yahoo", yahoo: "GBPUSD=X", digits: 5 },
  { symbol: "USDJPY", name: "Yen", short: "USDJPY", venue: "yahoo", yahoo: "USDJPY=X", digits: 3 },
  { symbol: "USDCHF", name: "Swiss franc", short: "USDCHF", venue: "yahoo", yahoo: "USDCHF=X", digits: 5 },
  { symbol: "AUDUSD", name: "Aussie", short: "AUDUSD", venue: "yahoo", yahoo: "AUDUSD=X", digits: 5 },
  { symbol: "USDCAD", name: "Canadian", short: "USDCAD", venue: "yahoo", yahoo: "USDCAD=X", digits: 5 },
  { symbol: "NZDUSD", name: "NZ dollar", short: "NZDUSD", venue: "yahoo", yahoo: "NZDUSD=X", digits: 5 },
  { symbol: "XAUUSD", name: "Gold", short: "GOLD", venue: "yahoo", yahoo: "XAUUSD=X", digits: 2 },
] as const;

export const MARKETS = [...CRYPTO, ...FOREX];

export type MarketSymbol = (typeof MARKETS)[number]["symbol"];

const LEGACY_SYMBOLS: Record<string, MarketSymbol> = {
  BTCUSDT: "BTCUSD",
  ETHUSDT: "ETHUSD",
  SOLUSDT: "SOLUSD",
  BNBUSDT: "BNBUSD",
  XRPUSDT: "XRPUSD",
  DOGEUSDT: "DOGEUSD",
  ADAUSDT: "ADAUSD",
  AVAXUSDT: "AVAXUSD",
  LINKUSDT: "LINKUSD",
};

export type Condition = "touch" | "cross-up" | "cross-down";
export type Tone = "phone" | "bell" | "siren";

export type Alert = {
  id: string;
  symbol: MarketSymbol;
  price: number;
  condition: Condition;
  tone: Tone;
  armed: boolean;
  repeat: boolean;
  latch: boolean;
};

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type BarSnap = {
  high: number;
  low: number;
  close: number;
};

export type Tick = BarSnap & {
  symbol: string;
  price: number;
  open: number;
  change: number | null;
};

const CONDITIONS: Condition[] = ["touch", "cross-up", "cross-down"];
const TONES: Tone[] = ["phone", "bell", "siren"];

export function isSymbol(value: string): value is MarketSymbol {
  return MARKETS.some((market) => market.symbol === value);
}

export function migrateSymbol(value: unknown): MarketSymbol | null {
  if (typeof value !== "string") return null;
  if (isSymbol(value)) return value;
  return LEGACY_SYMBOLS[value] ?? null;
}

export function isInterval(value: string): value is Interval {
  return (INTERVALS as readonly string[]).includes(value);
}

export function marketBySymbol(symbol: string) {
  return MARKETS.find((market) => market.symbol === symbol) ?? MARKETS[0];
}

export function coinbaseProductId(symbol: string): string | null {
  const market = MARKETS.find((item) => item.symbol === symbol);
  return market?.venue === "coinbase" ? market.product : null;
}

export function isCoinbase(symbol: string): boolean {
  return marketBySymbol(symbol).venue === "coinbase" && isSymbol(symbol);
}

function digitsFor(value: number, symbol?: string): number {
  if (symbol) {
    const market = MARKETS.find((item) => item.symbol === symbol);
    if (market) return market.digits;
  }
  const abs = Math.abs(value);
  if (abs >= 1000) return 2;
  if (abs >= 1) return 4;
  return 6;
}

export function formatPrice(value: number, symbol?: string): string {
  const digits = digitsFor(value, symbol);
  return value.toLocaleString("en-US", {
    minimumFractionDigits: Math.min(2, digits),
    maximumFractionDigits: digits,
  });
}

export function roundPrice(value: number, symbol?: string): number {
  const factor = 10 ** digitsFor(value, symbol);
  return Math.round(value * factor) / factor;
}

export function parsePrice(text: string, symbol?: string): number | null {
  const value = Number(text.replace(/,/g, "").trim());
  if (!Number.isFinite(value) || value <= 0) return null;
  return roundPrice(value, symbol);
}

export function conditionLabel(condition: Condition): string {
  if (condition === "touch") return "Touches the line";
  if (condition === "cross-up") return "Crosses above";
  return "Crosses below";
}

export function hitPhrase(condition: Condition): string {
  if (condition === "touch") return "touched your line";
  if (condition === "cross-up") return "crossed above your line";
  return "crossed below your line";
}

export function toneLabel(tone: Tone): string {
  if (tone === "phone") return "Ringtone";
  if (tone === "bell") return "Bell";
  return "Siren";
}

export function zoneHot(condition: Condition, line: number, bar: BarSnap): boolean {
  if (condition === "touch") return bar.high >= line && bar.low <= line;
  if (condition === "cross-up") return bar.close >= line;
  return bar.close <= line;
}

export function shouldFire(
  condition: Condition,
  line: number,
  prev: BarSnap,
  next: BarSnap,
): boolean {
  if (!(line > 0)) return false;
  if (condition === "touch") {
    const was = prev.high >= line && prev.low <= line;
    const now = next.high >= line && next.low <= line;
    return now && !was;
  }
  if (condition === "cross-up") return prev.close < line && next.close >= line;
  return prev.close > line && next.close <= line;
}

export function isAlert(value: unknown): value is Alert {
  if (!value || typeof value !== "object") return false;
  const alert = value as Partial<Alert>;
  return (
    typeof alert.id === "string" &&
    typeof alert.symbol === "string" &&
    isSymbol(alert.symbol) &&
    typeof alert.price === "number" &&
    alert.price > 0 &&
    typeof alert.condition === "string" &&
    CONDITIONS.includes(alert.condition) &&
    typeof alert.tone === "string" &&
    TONES.includes(alert.tone) &&
    typeof alert.armed === "boolean" &&
    typeof alert.repeat === "boolean"
  );
}

export function normalizeAlert(value: Alert): Alert {
  return { ...value, latch: value.latch === true };
}
