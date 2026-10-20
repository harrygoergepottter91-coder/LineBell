import { createFileRoute } from "@tanstack/react-router";
import {
  INTERVALS,
  MARKETS,
  coinbaseProductId,
  normalizeMarketSymbol,
  yahooTickerForSymbol,
  type Candle,
  type Interval,
} from "@/lib/markets";

const SYMBOLS = new Set<string>(MARKETS.map((market) => market.symbol));
const INTERVAL_SET = new Set<string>(INTERVALS);
const COINBASE = "https://api.exchange.coinbase.com";
const GOLD_SPOT = "https://api.gold-api.com/price/XAU";
const YAHOO_INTERVALS: Record<Interval, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "1h": "60m",
};
const RANGES: Record<Interval, string> = {
  "1m": "1d",
  "5m": "5d",
  "15m": "5d",
  "1h": "1mo",
};
const PERIODS: Record<Interval, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
};

const FETCH_ATTEMPTS = 2;
const FETCH_TIMEOUT_MS = 10_000;
const FEED_FALLBACK_LOG_INTERVAL_MS = 60_000;

async function fetchJson(url: string): Promise<unknown> {
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
    let retryable = true;
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!response.ok) {
        retryable = response.status === 429 || response.status >= 500;
        throw new Error(`upstream returned HTTP ${response.status}`);
      }
      return (await response.json()) as unknown;
    } catch (error) {
      if (!retryable || attempt === FETCH_ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }
  throw new Error("upstream request exhausted retries");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

type MarketFeed = {
  candles: Candle[];
  price: number;
  quoteTime: number;
  change: number | null;
  closed: boolean;
};

const yahooFeedCache = new Map<
  string,
  { feed: MarketFeed; lastFallbackWarningAt: number }
>();
const goldFeedCache = new Map<
  string,
  { feed: MarketFeed; lastFallbackWarningAt: number }
>();

async function coinbaseProductFeed(symbol: string, interval: Interval) {
  const product = coinbaseProductId(symbol);
  if (!product) {
    console.error(`[market] No Coinbase product mapping for ${symbol}`);
    throw new Error(`invalid Coinbase symbol mapping: ${symbol}`);
  }

  const now = Math.floor(Date.now() / 1000);
  const period = PERIODS[interval];
  const start = new Date((now - period * 180) * 1000).toISOString();
  const end = new Date(now * 1000).toISOString();
  const productPath = `${COINBASE}/products/${encodeURIComponent(product)}`;
  const [candlePayload, tickerPayload, statsPayload] = await Promise.all([
    fetchJson(
      `${productPath}/candles?granularity=${period}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
    ),
    fetchJson(`${productPath}/ticker`),
    fetchJson(`${productPath}/stats`),
  ]);
  if (!Array.isArray(candlePayload) || !isRecord(tickerPayload) || !isRecord(statsPayload)) {
    console.error(`[market] Malformed Coinbase response for ${symbol}`, {
      candles: Array.isArray(candlePayload),
      ticker: isRecord(tickerPayload),
      stats: isRecord(statsPayload),
    });
    throw new Error(`malformed Coinbase response for ${symbol}`);
  }

  const byTime = new Map<number, Candle>();
  for (const row of candlePayload) {
    if (!Array.isArray(row) || row.length < 5) {
      console.warn(`[market] Ignoring malformed Coinbase candle for ${symbol}`, row);
      continue;
    }
    const [timeValue, low, high, open, close] = row.map(Number);
    if (
      ![timeValue, low, high, open, close].every(Number.isFinite) ||
      timeValue <= 0 ||
      low <= 0 ||
      high < low ||
      open <= 0 ||
      close <= 0
    ) {
      console.warn(`[market] Ignoring invalid Coinbase candle for ${symbol}`, row);
      continue;
    }
    byTime.set(Math.floor(timeValue), {
      time: Math.floor(timeValue),
      open,
      high,
      low,
      close,
    });
  }
  const candles = [...byTime.values()].sort((left, right) => left.time - right.time);
  const last = candles[candles.length - 1];
  const price = Number(tickerPayload.price);
  const quoteTime = Date.parse(String(tickerPayload.time)) / 1000;
  const open = Number(statsPayload.open);
  if (!last || !Number.isFinite(price) || price <= 0 || !Number.isFinite(quoteTime)) {
    console.error(`[market] Coinbase returned no usable price/candles for ${symbol}`);
    throw new Error(`empty Coinbase feed for ${symbol}`);
  }

  return {
    candles,
    price,
    quoteTime,
    change: Number.isFinite(open) && open > 0 ? ((price - open) / open) * 100 : null,
    closed: false,
  };
}

async function fetchGoldSpotFeed(interval: Interval): Promise<MarketFeed> {
  const payload = await fetchJson(GOLD_SPOT);
  if (!isRecord(payload)) {
    console.error("[market] Malformed Gold API response", payload);
    throw new Error("malformed Gold API response");
  }

  const price = Number(payload.price);
  const quoteTime = Date.parse(String(payload.updatedAt)) / 1000;
  if (
    payload.symbol !== "XAU" ||
    payload.currency !== "USD" ||
    !Number.isFinite(price) ||
    price <= 0 ||
    !Number.isFinite(quoteTime) ||
    quoteTime <= 0
  ) {
    console.error("[market] Gold API returned no usable XAU/USD spot quote", payload);
    throw new Error("empty Gold API spot quote");
  }

  const time = Math.floor(quoteTime / PERIODS[interval]) * PERIODS[interval];
  const grace = Math.max(PERIODS[interval] * 4, 20 * 60);
  return {
    candles: [{ time, open: price, high: price, low: price, close: price }],
    price,
    quoteTime,
    change: null,
    closed: Date.now() / 1000 - quoteTime > grace,
  };
}

async function goldSpotFeed(
  interval: Interval,
): Promise<MarketFeed & { stale?: boolean }> {
  const key = `XAUUSD:${interval}`;
  try {
    const feed = await fetchGoldSpotFeed(interval);
    goldFeedCache.set(key, { feed, lastFallbackWarningAt: 0 });
    return feed;
  } catch (error) {
    const cached = goldFeedCache.get(key);
    if (!cached) throw error;

    const now = Date.now();
    if (now - cached.lastFallbackWarningAt >= FEED_FALLBACK_LOG_INTERVAL_MS) {
      console.warn("[market] Gold spot request failed; serving the last validated feed", error);
      cached.lastFallbackWarningAt = now;
    }
    return { ...cached.feed, stale: true };
  }
}

async function fetchYahooFeed(symbol: string, interval: Interval): Promise<MarketFeed> {
  const ticker = yahooTickerForSymbol(symbol);
  if (!ticker) {
    console.error(`[market] No Yahoo symbol mapping for ${symbol}`);
    throw new Error(`invalid Yahoo symbol mapping: ${symbol}`);
  }
  const url = new URL(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`,
  );
  url.searchParams.set("interval", YAHOO_INTERVALS[interval]);
  url.searchParams.set("range", RANGES[interval]);
  const payload = await fetchJson(url.toString());
  if (!isRecord(payload) || !isRecord(payload.chart)) {
    console.error(`[market] Malformed Yahoo response for ${symbol}`, payload);
    throw new Error(`malformed Yahoo response for ${symbol}`);
  }
  if (payload.chart.error) {
    console.error(`[market] Yahoo reported a feed error for ${symbol}`, payload.chart.error);
    throw new Error(`Yahoo feed error for ${symbol}`);
  }
  const result = Array.isArray(payload.chart.result) ? payload.chart.result[0] : null;
  if (!isRecord(result)) {
    console.error(`[market] Yahoo returned no chart result for ${symbol}`, payload.chart);
    throw new Error(`empty Yahoo chart result for ${symbol}`);
  }
  const timestamps = Array.isArray(result.timestamp) ? result.timestamp : [];
  const indicators = isRecord(result.indicators) ? result.indicators : null;
  const quotes = indicators && Array.isArray(indicators.quote) ? indicators.quote : [];
  const quote = quotes[0];
  const meta = isRecord(result.meta) ? result.meta : {};
  if (!isRecord(quote)) {
    console.error(`[market] Yahoo returned no candles for ${symbol}`, result);
    throw new Error(`empty Yahoo candles for ${symbol}`);
  }
  const values = {
    open: Array.isArray(quote.open) ? quote.open : [],
    high: Array.isArray(quote.high) ? quote.high : [],
    low: Array.isArray(quote.low) ? quote.low : [],
    close: Array.isArray(quote.close) ? quote.close : [],
  };
  const byTime = new Map<number, Candle>();
  for (let i = 0; i < timestamps.length; i++) {
    const rawValues = [
      timestamps[i],
      values.open[i],
      values.high[i],
      values.low[i],
      values.close[i],
    ];
    if (
      rawValues.some(
        (value) =>
          value == null ||
          (typeof value !== "number" && typeof value !== "string") ||
          value === "",
      )
    ) {
      continue;
    }
    const [time, open, high, low, close] = rawValues.map(Number);
    if (
      ![time, open, high, low, close].every(Number.isFinite) ||
      time <= 0 ||
      open <= 0 ||
      low <= 0 ||
      close <= 0 ||
      high < Math.max(open, low, close) ||
      low > Math.min(open, high, close)
    ) {
      continue;
    }
    byTime.set(Math.floor(time), { time: Math.floor(time), open, high, low, close });
  }
  const candles = [...byTime.values()].sort((left, right) => left.time - right.time).slice(-180);
  const last = candles[candles.length - 1];
  if (!last) {
    console.error(`[market] Yahoo returned no valid candles for ${symbol}`);
    throw new Error(`empty Yahoo feed for ${symbol}`);
  }

  const price = Number(meta.regularMarketPrice ?? last.close);
  const previous = Number(meta.chartPreviousClose ?? meta.previousClose);
  const reportedChange = Number(meta.regularMarketChangePercent);
  const change =
    Number.isFinite(reportedChange) && meta.regularMarketChangePercent != null
      ? reportedChange
      : Number.isFinite(previous) && previous > 0 && Number.isFinite(price)
        ? ((price - previous) / previous) * 100
        : null;
  const lastMarketTime = Number(meta.regularMarketTime ?? last.time);
  const grace = Math.max(PERIODS[interval] * 4, 20 * 60);
  return {
    candles,
    price: Number.isFinite(price) && price > 0 ? price : last.close,
    quoteTime: lastMarketTime,
    change,
    closed: Date.now() / 1000 - lastMarketTime > grace,
  };
}

async function yahooFeed(
  symbol: string,
  interval: Interval,
): Promise<MarketFeed & { stale?: boolean }> {
  const key = `${symbol}:${interval}`;
  try {
    const feed = await fetchYahooFeed(symbol, interval);
    yahooFeedCache.set(key, { feed, lastFallbackWarningAt: 0 });
    return feed;
  } catch (error) {
    const cached = yahooFeedCache.get(key);
    if (!cached) throw error;

    const now = Date.now();
    if (now - cached.lastFallbackWarningAt >= FEED_FALLBACK_LOG_INTERVAL_MS) {
      console.warn(`[market] Yahoo request failed for ${symbol}; serving the last validated feed`, error);
      cached.lastFallbackWarningAt = now;
    }
    return { ...cached.feed, stale: true };
  }
}

export const Route = createFileRoute("/api/market")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const symbol = normalizeMarketSymbol(url.searchParams.get("symbol") || "BTCUSD");
        const interval = url.searchParams.get("interval") || "1m";
        if (!symbol || !SYMBOLS.has(symbol) || !INTERVAL_SET.has(interval)) {
          console.error(
            `[market] Rejected invalid request mapping: ${url.searchParams.get("symbol")}/${interval}`,
          );
          return Response.json({ error: "Unknown market" }, { status: 400 });
        }

        try {
          const feed =
            coinbaseProductId(symbol) !== null
              ? await coinbaseProductFeed(symbol, interval as Interval)
              : symbol === "XAUUSD"
                ? await goldSpotFeed(interval as Interval)
                : await yahooFeed(symbol, interval as Interval);
          return Response.json(
            { symbol, interval, ...feed },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          console.error(`[market] ${symbol} feed request failed`, error);
          return Response.json({ error: "Market feed unavailable" }, { status: 502 });
        }
      },
    },
  },
});
