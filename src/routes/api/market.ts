import { createFileRoute } from "@tanstack/react-router";
import {
  INTERVALS,
  MARKETS,
  coinbaseProductId,
  marketBySymbol,
  type Candle,
  type Interval,
} from "@/lib/markets";

const SYMBOLS = new Set<string>(MARKETS.map((market) => market.symbol));
const INTERVAL_SET = new Set<string>(INTERVALS);
const COINBASE = "https://api.exchange.coinbase.com";
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

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { "user-agent": "Linebell/1.0" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`upstream returned HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
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

async function yahooFeed(symbol: string, interval: Interval) {
  const ticker = marketBySymbol(symbol).yahoo;
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
  let invalidCandleCount = 0;
  for (let i = 0; i < timestamps.length; i++) {
    const time = Number(timestamps[i]);
    const open = Number(values.open[i]);
    const high = Number(values.high[i]);
    const low = Number(values.low[i]);
    const close = Number(values.close[i]);
    if (
      ![time, open, high, low, close].every(Number.isFinite) ||
      time <= 0 ||
      open <= 0 ||
      high < low ||
      low <= 0 ||
      close <= 0
    ) {
      invalidCandleCount += 1;
      continue;
    }
    byTime.set(Math.floor(time), { time: Math.floor(time), open, high, low, close });
  }
  if (invalidCandleCount > 0) {
    console.warn(`[market] Ignored ${invalidCandleCount} malformed Yahoo candles for ${symbol}`);
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

export const Route = createFileRoute("/api/market")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const symbol = (url.searchParams.get("symbol") || "BTCUSD").toUpperCase();
        const interval = url.searchParams.get("interval") || "1m";
        if (!SYMBOLS.has(symbol) || !INTERVAL_SET.has(interval)) {
          console.error(`[market] Rejected invalid request mapping: ${symbol}/${interval}`);
          return Response.json({ error: "Unknown market" }, { status: 400 });
        }

        try {
          const feed =
            coinbaseProductId(symbol) !== null
              ? await coinbaseProductFeed(symbol, interval as Interval)
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
