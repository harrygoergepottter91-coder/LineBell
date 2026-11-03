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
const GOLD_HISTORY = "https://api.fxratesapi.com/timeseries";
const GOLD_HISTORY_DAYS = 180;
const MIN_GOLD_HISTORY_BARS = 100;
const TWELVE_DATA_TIME_SERIES = "https://api.twelvedata.com/time_series";
const TWELVE_DATA_SYMBOLS: Record<string, string> = {
  EURUSD: "EUR/USD",
  GBPUSD: "GBP/USD",
  AUDUSD: "AUD/USD",
  NZDUSD: "NZD/USD",
  USDJPY: "USD/JPY",
  USDCAD: "USD/CAD",
  USDCHF: "USD/CHF",
  XAUUSD: "XAU/USD",
};
const TWELVE_DATA_INTERVALS: Record<Interval, string> = {
  "1m": "1min",
  "5m": "5min",
  "15m": "15min",
  "1h": "1h",
};
const MIN_FOREX_METAL_CANDLES = 2;
const EXTERNAL_API_HOSTS = new Set([
  "api.exchange.coinbase.com",
  "api.gold-api.com",
  "api.fxratesapi.com",
  "api.twelvedata.com",
  "query1.finance.yahoo.com",
]);
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
const FETCH_TIMEOUT_MS = 5_000;
const FEED_FALLBACK_LOG_INTERVAL_MS = 60_000;

async function fetchJson(url: string): Promise<unknown> {
  let endpoint: URL;
  try {
    endpoint = new URL(url);
  } catch {
    throw new Error("market provider URL must be absolute");
  }
  if (
    endpoint.protocol !== "https:" ||
    !EXTERNAL_API_HOSTS.has(endpoint.hostname) ||
    endpoint.username ||
    endpoint.password
  ) {
    throw new Error("market provider URL is not an approved external HTTPS endpoint");
  }

  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
    let retryable = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(endpoint, {
        keepalive: false,
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        retryable = response.status === 429 || response.status >= 500;
        throw new Error(`upstream returned HTTP ${response.status}`);
      }
      return (await response.json()) as unknown;
    } catch (error) {
      if (!retryable || attempt === FETCH_ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    } finally {
      clearTimeout(timeout);
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
const forexMetalFeedCache = new Map<
  string,
  { feed: MarketFeed; lastFallbackWarningAt: number }
>();
const forexMetalWarningTimes = new Map<string, number>();
const lastGoodMarketFeeds = new Map<string, MarketFeed>();

function unavailableMarketFeed(symbol: string, interval: Interval): MarketFeed & { stale: true } {
  const key = `${symbol}:${interval}`;
  const cached = lastGoodMarketFeeds.get(key);
  const lastWarningAt = forexMetalWarningTimes.get(`${key}:network`) ?? 0;
  if (Date.now() - lastWarningAt >= FEED_FALLBACK_LOG_INTERVAL_MS) {
    console.warn(`[market] Providers unavailable for ${symbol}; using cached or empty candles`);
    forexMetalWarningTimes.set(`${key}:network`, Date.now());
  }
  return cached
    ? { ...cached, stale: true }
    : {
        candles: [],
        price: 0,
        quoteTime: 0,
        change: null,
        closed: true,
        stale: true,
      };
}

function warnForexMetalFallback(key: string, symbol: string, message: string) {
  const now = Date.now();
  const lastWarningAt = forexMetalWarningTimes.get(key) ?? 0;
  if (now - lastWarningAt < FEED_FALLBACK_LOG_INTERVAL_MS) return;
  console.warn(`[market] ${message} for ${symbol}`);
  forexMetalWarningTimes.set(key, now);
}

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
  const today = new Date();
  const endDate = today.toISOString().slice(0, 10);
  const startDate = new Date(
    today.getTime() - GOLD_HISTORY_DAYS * 24 * 60 * 60 * 1000,
  )
    .toISOString()
    .slice(0, 10);
  const historyUrl = new URL(GOLD_HISTORY);
  historyUrl.searchParams.set("base", "XAU");
  historyUrl.searchParams.set("symbols", "USD");
  historyUrl.searchParams.set("start_date", startDate);
  historyUrl.searchParams.set("end_date", endDate);
  const [spotPayload, historyPayload] = await Promise.all([
    fetchJson(GOLD_SPOT),
    fetchJson(historyUrl.toString()),
  ]);
  if (!isRecord(spotPayload)) {
    console.error("[market] Malformed Gold API response", spotPayload);
    throw new Error("malformed Gold API response");
  }

  const price = Number(spotPayload.price);
  const quoteTime = Date.parse(String(spotPayload.updatedAt)) / 1000;
  if (
    spotPayload.symbol !== "XAU" ||
    spotPayload.currency !== "USD" ||
    !Number.isFinite(price) ||
    price <= 0 ||
    !Number.isFinite(quoteTime) ||
    quoteTime <= 0
  ) {
    console.error("[market] Gold API returned no usable XAU/USD spot quote", spotPayload);
    throw new Error("empty Gold API spot quote");
  }

  if (!isRecord(historyPayload) || !isRecord(historyPayload.rates)) {
    console.error("[market] Malformed historical XAU/USD response", historyPayload);
    throw new Error("malformed historical XAU/USD response");
  }

  const currentDay = Math.floor(quoteTime / 86_400) * 86_400;
  const dailyRates = new Map<number, number>();
  for (const [date, rates] of Object.entries(historyPayload.rates)) {
    const dateTime = Date.parse(date);
    const dailyPrice = isRecord(rates) ? Number(rates.USD) : Number.NaN;
    if (
      !Number.isFinite(dateTime) ||
      !Number.isFinite(dailyPrice) ||
      dailyPrice <= 0
    ) {
      console.warn("[market] Ignoring malformed historical XAU/USD point", { date, rates });
      continue;
    }
    const time = Math.floor(dateTime / 86_400_000) * 86_400;
    if (time < currentDay) dailyRates.set(time, dailyPrice);
  }

  const historyCandles = [...dailyRates.entries()]
    .sort(([left], [right]) => left - right)
    .slice(-GOLD_HISTORY_DAYS)
    .map(([time, close]) => ({ time, open: close, high: close, low: close, close }));
  if (historyCandles.length < MIN_GOLD_HISTORY_BARS) {
    console.error(
      `[market] Historical XAU/USD returned ${historyCandles.length} daily points; expected at least ${MIN_GOLD_HISTORY_BARS}`,
    );
    throw new Error("insufficient historical XAU/USD data");
  }

  const time = Math.floor(quoteTime / PERIODS[interval]) * PERIODS[interval];
  const previousClose = historyCandles[historyCandles.length - 1]!.close;
  const grace = Math.max(PERIODS[interval] * 4, 20 * 60);
  return {
    candles: [
      ...historyCandles,
      { time, open: price, high: price, low: price, close: price },
    ],
    price,
    quoteTime,
    change: ((price - previousClose) / previousClose) * 100,
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
      console.warn("[market] Gold spot request failed; serving the last validated feed");
      cached.lastFallbackWarningAt = now;
    }
    return { ...cached.feed, stale: true };
  }
}

function parseTwelveDataTime(value: unknown): number {
  if (typeof value !== "string") return Number.NaN;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  const milliseconds = Date.parse(normalized);
  return Number.isFinite(milliseconds) ? Math.floor(milliseconds / 1000) : Number.NaN;
}

async function fetchTwelveDataFeed(
  symbol: string,
  interval: Interval,
): Promise<MarketFeed> {
  const apiKey = process.env.TWELVE_DATA_API_KEY?.trim();
  const providerSymbol = TWELVE_DATA_SYMBOLS[symbol];
  if (!apiKey || !providerSymbol) {
    throw new Error("Twelve Data is not configured for this market");
  }

  const url = new URL(TWELVE_DATA_TIME_SERIES);
  url.searchParams.set("symbol", providerSymbol);
  url.searchParams.set("interval", TWELVE_DATA_INTERVALS[interval]);
  url.searchParams.set("outputsize", "500");
  url.searchParams.set("timezone", "UTC");
  url.searchParams.set("apikey", apiKey);
  const payload = await fetchJson(url.toString());
  if (!isRecord(payload)) {
    console.warn(`[market] Twelve Data returned a malformed response for ${symbol}`);
    throw new Error("malformed Twelve Data response");
  }
  if (payload.status === "error") {
    const code = Number(payload.code);
    throw new Error(
      code === 429 ? "Twelve Data rate limit reached" : "Twelve Data rejected the request",
    );
  }
  if (!Array.isArray(payload.values)) {
    console.warn(`[market] Twelve Data returned no candle array for ${symbol}`);
    throw new Error("empty Twelve Data response");
  }

  const byTime = new Map<number, Candle>();
  for (const value of payload.values) {
    if (!isRecord(value)) continue;
    const time = parseTwelveDataTime(value.datetime);
    const open = Number(value.open);
    const high = Number(value.high);
    const low = Number(value.low);
    const close = Number(value.close);
    if (
      !Number.isSafeInteger(time) ||
      time <= 0 ||
      ![open, high, low, close].every(Number.isFinite) ||
      open <= 0 ||
      low <= 0 ||
      close <= 0 ||
      high < Math.max(open, low, close) ||
      low > Math.min(open, high, close)
    ) {
      continue;
    }
    byTime.set(time, { time, open, high, low, close });
  }

  const candles = [...byTime.values()].sort((left, right) => left.time - right.time);
  if (candles.length < MIN_FOREX_METAL_CANDLES) {
    console.warn(
      `[market] Twelve Data returned only ${candles.length} valid candles for ${symbol}`,
    );
    throw new Error("insufficient Twelve Data candles");
  }

  const last = candles[candles.length - 1]!;
  const previous = candles[candles.length - 2]!;
  const grace = Math.max(PERIODS[interval] * 4, 20 * 60);
  return {
    candles,
    price: last.close,
    quoteTime: last.time,
    change: ((last.close - previous.close) / previous.close) * 100,
    closed: Date.now() / 1000 - last.time > grace,
  };
}

async function forexMetalFeed(
  symbol: string,
  interval: Interval,
): Promise<MarketFeed & { stale?: boolean }> {
  const key = `${symbol}:${interval}`;
  const apiKey = process.env.TWELVE_DATA_API_KEY?.trim();
  try {
    if (apiKey) {
      try {
        const feed = await fetchTwelveDataFeed(symbol, interval);
        forexMetalFeedCache.set(key, { feed, lastFallbackWarningAt: 0 });
        return feed;
      } catch {
        warnForexMetalFallback(
          `${key}:twelve-data`,
          symbol,
          "Twelve Data unavailable; trying the public fallback",
        );
      }
    }

    const feed =
      symbol === "XAUUSD"
        ? await goldSpotFeed(interval)
        : await yahooFeed(symbol, interval);
    forexMetalFeedCache.set(key, { feed, lastFallbackWarningAt: 0 });
    return feed;
  } catch (error) {
    const cached = forexMetalFeedCache.get(key);
    if (!cached) throw error;

    warnForexMetalFallback(`${key}:cache`, symbol, "Providers unavailable; serving cached candles");
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
  if (candles.length < MIN_FOREX_METAL_CANDLES || !last) {
    console.warn(`[market] Yahoo returned insufficient valid candles for ${symbol}`);
    throw new Error("insufficient Yahoo candles");
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
      console.warn(`[market] Yahoo request failed for ${symbol}; serving the last validated feed`);
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
          const feed = coinbaseProductId(symbol) !== null
            ? await coinbaseProductFeed(symbol, interval as Interval)
            : await forexMetalFeed(symbol, interval as Interval);
          lastGoodMarketFeeds.set(`${symbol}:${interval}`, feed);
          return Response.json(
            { symbol, interval, ...feed },
            { headers: { "cache-control": "no-store" } },
          );
        } catch {
          return Response.json(
            {
              symbol,
              interval,
              ...unavailableMarketFeed(symbol, interval as Interval),
            },
            { headers: { "cache-control": "no-store" } },
          );
        }
      },
    },
  },
});
