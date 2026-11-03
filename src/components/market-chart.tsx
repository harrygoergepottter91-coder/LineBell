import { useEffect, useRef, useState } from "react";
import type { IChartApi, IPriceLine, ISeriesApi, LineStyle, UTCTimestamp } from "lightweight-charts";
import { apiPath } from "@/lib/api-path";
import {
  coinbaseProductId,
  isCoinbase,
  marketBySymbol,
  normalizeUnixTimestamp,
  type Candle,
  type Interval,
} from "@/lib/markets";

export type LineMark = {
  id: string;
  price: number;
  selected: boolean;
  hot: boolean;
  armed: boolean;
};

export type FeedStatus = "connecting" | "live" | "offline" | "closed";

type MarketChartProps = {
  symbol: string;
  interval: Interval;
  lines: LineMark[];
  onTick: (tick: {
    symbol: string;
    price: number;
    change: number | null;
    open: number;
    high: number;
    low: number;
    close: number;
  }) => void;
  onPick: (price: number) => void;
  onStatus: (status: FeedStatus) => void;
};

type FeedBody = {
  candles?: Candle[];
  change?: number;
  closed?: boolean;
  price?: number;
  quoteTime?: number;
  stale?: boolean;
};

const INTERVAL_SECONDS: Record<Interval, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
};

function cssColor(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function palette() {
  return {
    panel: cssColor("--color-panel", "#151c19"),
    fog: cssColor("--color-fog", "#93a399"),
    line: cssColor("--color-line", "#2c3a34"),
    mint: cssColor("--color-mint", "#3dcc8e"),
    heat: cssColor("--color-heat", "#ff5c45"),
    copper: cssColor("--color-copper", "#e4a15c"),
  };
}

export function MarketChart({ symbol, interval, lines, onTick, onPick, onStatus }: MarketChartProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onTickRef = useRef(onTick);
  const onPickRef = useRef(onPick);
  const onStatusRef = useRef(onStatus);
  const linesRef = useRef(lines);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const [feed, setFeed] = useState<"loading" | "ready" | "error" | "empty">("loading");
  const [attempt, setAttempt] = useState(0);

  onTickRef.current = onTick;
  onPickRef.current = onPick;
  onStatusRef.current = onStatus;
  linesRef.current = lines;

  const paintLines = () => {
    const series = seriesRef.current;
    if (!series) return;
    for (const priceLine of priceLinesRef.current) series.removePriceLine(priceLine);
    const colors = palette();
    priceLinesRef.current = linesRef.current
      .filter((line) => Number.isFinite(line.price) && line.price > 0)
      .map((line) =>
        series.createPriceLine({
          price: line.price,
          color: line.hot ? colors.heat : line.selected ? colors.copper : colors.fog,
          lineWidth: line.selected || line.hot ? 2 : 1,
          lineStyle: 2 as LineStyle,
          axisLabelVisible: true,
          title: line.hot ? "Hit" : line.armed ? "Armed" : "Line",
        }),
      );
  };

  useEffect(() => {
    paintLines();
  }, [lines]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let dead = false;
    let chart: IChartApi | null = null;
    let socket: WebSocket | null = null;
    let visibilityHandler: (() => void) | null = null;
    let poll: number | null = null;
    let reconnectTimer: number | null = null;
    let reconnectAttempt = 0;
    let socketOpen = false;
    let pageVisible = !document.hidden;
    let historyRefreshInFlight = false;
    let pollInFlight = false;
    let loadVersion = 0;
    let hasData = false;
    let marketClosed = false;
    let lastSeriesTime = 0;
    let lastChange: number | null = null;
    let latestBar: Candle | null = null;

    onStatusRef.current("connecting");
    setFeed("loading");

    const publish = (bar: Candle, change: number | null, price = bar.close) => {
      onTickRef.current({
        symbol,
        price,
        change,
        open: bar.open,
        high: Math.max(bar.high, price),
        low: Math.min(bar.low, price),
        close: price,
      });
    };

    (async () => {
      const charts = await import("lightweight-charts");
      if (dead || !hostRef.current) return;
      const colors = palette();
      chart = charts.createChart(host, {
        autoSize: true,
        layout: {
          background: { type: charts.ColorType.Solid, color: colors.panel },
          textColor: colors.fog,
          fontFamily: "IBM Plex Mono, ui-monospace, monospace",
        },
        grid: {
          vertLines: { color: colors.line },
          horzLines: { color: colors.line },
        },
        rightPriceScale: { borderColor: colors.line },
        timeScale: {
          borderColor: colors.line,
          timeVisible: true,
          secondsVisible: false,
        },
        crosshair: { mode: charts.CrosshairMode.Normal },
      });
      const series = chart.addCandlestickSeries({
        upColor: colors.mint,
        downColor: colors.heat,
        borderUpColor: colors.mint,
        borderDownColor: colors.heat,
        wickUpColor: colors.mint,
        wickDownColor: colors.heat,
        priceFormat: {
          type: "price",
          precision: marketBySymbol(symbol).digits,
          minMove: 10 ** -marketBySymbol(symbol).digits,
        },
      });
      seriesRef.current = series;
      chart.subscribeClick((param) => {
        if (!param.point) return;
        const price = series.coordinateToPrice(param.point.y);
        if (price == null || !Number.isFinite(price) || price <= 0) return;
        onPickRef.current(price);
      });

      const load = async (full: boolean) => {
        const version = full ? ++loadVersion : loadVersion;
        const res = await fetch(apiPath(`/api/market?symbol=${symbol}&interval=${interval}`), {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`feed returned HTTP ${res.status}`);
        const body = (await res.json()) as FeedBody;
        if (dead || version !== loadVersion) return;
        const uniqueCandles = new Map<number, Candle>();
        for (const candle of body.candles ?? []) {
          const time = normalizeUnixTimestamp(candle.time);
          if (
            !Number.isSafeInteger(time) ||
            time <= 0 ||
            ![candle.open, candle.high, candle.low, candle.close].every(Number.isFinite) ||
            candle.open <= 0 ||
            candle.low <= 0 ||
            candle.high < candle.low ||
            candle.close <= 0
          ) {
            console.warn(`[market] Ignoring malformed candle for ${symbol}`, candle);
            continue;
          }
          uniqueCandles.set(time, { ...candle, time });
        }
        const candles = [...uniqueCandles.values()].sort((left, right) => left.time - right.time);
        if (!candles.length) {
          if (!dead && version === loadVersion) {
            setFeed(hasData ? "ready" : "empty");
            onStatusRef.current("offline");
          }
          return;
        }
        if (dead || version !== loadVersion) return;
        const last = candles[candles.length - 1]!;
        if (full || !hasData) {
          series.setData(
            candles.map((candle) => ({
              time: candle.time as UTCTimestamp,
              open: candle.open,
              high: candle.high,
              low: candle.low,
              close: candle.close,
            })),
          );
          if (symbol === "XAUUSD") chart?.timeScale().fitContent();
          latestBar = last;
          lastSeriesTime = last.time;
          paintLines();
        }
        hasData = true;
        marketClosed = Boolean(body.closed || body.stale);
        lastChange = Number.isFinite(body.change) ? (body.change ?? null) : null;
        const price = Number(body.price);
        const quoteTime = normalizeUnixTimestamp(Number(body.quoteTime));
        let current = latestBar ?? last;
        if (
          !socketOpen &&
          !body.stale &&
          !marketClosed &&
          Number.isFinite(price) &&
          price > 0 &&
          Number.isFinite(quoteTime) &&
          quoteTime > 0
        ) {
          const time = Math.floor(quoteTime / INTERVAL_SECONDS[interval]) * INTERVAL_SECONDS[interval];
          if (time >= lastSeriesTime) {
            current =
              time === latestBar?.time
                ? {
                    ...latestBar,
                    high: Math.max(latestBar.high, price),
                    low: Math.min(latestBar.low, price),
                    close: price,
                  }
                : { time, open: price, high: price, low: price, close: price };
            series.update({
              time: current.time as UTCTimestamp,
              open: current.open,
              high: current.high,
              low: current.low,
              close: current.close,
            });
            latestBar = current;
            lastSeriesTime = current.time;
          }
        }
        if ((full || !socketOpen) && !body.stale) {
          publish(current, lastChange, Number.isFinite(price) && price > 0 ? price : current.close);
        }
        setFeed("ready");
        onStatusRef.current(body.stale ? "offline" : marketClosed ? "closed" : "live");
      };

      try {
        await load(true);
      } catch (error) {
        if (!dead) {
          console.error(`[market] Initial feed load failed for ${symbol}`, error);
          setFeed("error");
          onStatusRef.current("offline");
        }
        return;
      }
      if (dead) return;

      pageVisible = !document.hidden;
      const product = coinbaseProductId(symbol);
      const connect = () => {
        if (dead || !pageVisible || !product) return;
        try {
          const ws = new WebSocket("wss://ws-feed.exchange.coinbase.com");
          socket = ws;
          ws.onopen = () => {
            ws.send(
              JSON.stringify({
                type: "subscribe",
                product_ids: [product],
                channels: ["ticker"],
              }),
            );
            socketOpen = true;
            reconnectAttempt = 0;
            if (!dead) onStatusRef.current("live");
          };
          ws.onclose = () => {
            if (socket !== ws) return;
            socket = null;
            socketOpen = false;
            if (dead) return;
            console.warn(`[market] Coinbase WebSocket closed for ${symbol}`);
            onStatusRef.current(marketClosed ? "closed" : "offline");
            if (reconnectTimer !== null) return;
            const delay = Math.min(1000 * 2 ** reconnectAttempt, 30_000);
            reconnectAttempt += 1;
            reconnectTimer = window.setTimeout(() => {
              reconnectTimer = null;
              connect();
            }, delay);
          };
          ws.onerror = () => {
            console.warn(`[market] Coinbase WebSocket error for ${symbol}`);
            ws.close();
          };
          ws.onmessage = (event) => {
            if (dead || !pageVisible) return;
            let message: unknown;
            try {
              message = JSON.parse(String(event.data));
            } catch (error) {
              console.warn(`[market] Malformed Coinbase JSON for ${symbol}`, error);
              return;
            }
            if (!message || typeof message !== "object") {
              console.warn(`[market] Malformed Coinbase payload for ${symbol}`, message);
              return;
            }
            const msg = message as Record<string, unknown>;
            if (msg.type !== "ticker") return;
            const price = Number(msg.price);
            const time = Date.parse(String(msg.time)) / 1000;
            if (
              msg.product_id !== product ||
              !Number.isFinite(price) ||
              price <= 0 ||
              !Number.isFinite(time) ||
              time <= 0
            ) {
              console.warn(`[market] Invalid Coinbase ticker mapping/payload for ${symbol}`, message);
              return;
            }
            const bucket = Math.floor(time / INTERVAL_SECONDS[interval]) * INTERVAL_SECONDS[interval];
            if (bucket < lastSeriesTime) return;
            const previous = latestBar;
            const bar: Candle =
              previous && bucket === previous.time
                ? {
                    time: bucket,
                    open: previous.open,
                    high: Math.max(previous.high, price),
                    low: Math.min(previous.low, price),
                    close: price,
                  }
                : { time: bucket, open: price, high: price, low: price, close: price };
            series.update({
              time: bar.time as UTCTimestamp,
              open: bar.open,
              high: bar.high,
              low: bar.low,
              close: bar.close,
            });
            latestBar = bar;
            lastSeriesTime = bar.time;
            publish(bar, lastChange, price);
            onStatusRef.current("live");
          };
        } catch (error) {
          console.error(`[market] Could not open Coinbase WebSocket for ${symbol}`, error);
          socketOpen = false;
          if (!dead && reconnectTimer === null) {
            const delay = Math.min(1000 * 2 ** reconnectAttempt, 30_000);
            reconnectAttempt += 1;
            reconnectTimer = window.setTimeout(() => {
              reconnectTimer = null;
              connect();
            }, delay);
          }
        }
      };
      if (isCoinbase(symbol)) connect();

      const onVisibilityChange = () => {
        if (document.hidden) {
          pageVisible = false;
          if (reconnectTimer !== null) {
            window.clearTimeout(reconnectTimer);
            reconnectTimer = null;
          }
          const hiddenSocket = socket;
          socket = null;
          socketOpen = false;
          hiddenSocket?.close();
          return;
        }

        pageVisible = true;
        if (historyRefreshInFlight) return;
        historyRefreshInFlight = true;
        void load(true)
          .catch((error) => {
            console.warn(`[market] Resume history refresh failed for ${symbol}`, error);
            if (!dead && !socketOpen) {
              onStatusRef.current(hasData ? (marketClosed ? "closed" : "live") : "offline");
            }
          })
          .finally(() => {
            historyRefreshInFlight = false;
            if (!dead && pageVisible && isCoinbase(symbol) && !socketOpen) connect();
          });
      };
      visibilityHandler = onVisibilityChange;
      document.addEventListener("visibilitychange", onVisibilityChange);

      poll = window.setInterval(() => {
        if (dead || document.hidden || socketOpen || historyRefreshInFlight || pollInFlight) return;
        pollInFlight = true;
        void load(false).catch((error) => {
          console.warn(`[market] Polling feed failed for ${symbol}`, error);
          if (!dead && !socketOpen) onStatusRef.current(hasData ? (marketClosed ? "closed" : "live") : "offline");
        }).finally(() => {
          pollInFlight = false;
        });
      }, product ? 4000 : 5000);
    })().catch((error) => {
      if (!dead) {
        console.error(`[market] Failed to initialize feed for ${symbol}`, error);
        setFeed("error");
        onStatusRef.current("offline");
      }
    });

    return () => {
      dead = true;
      if (poll !== null) window.clearInterval(poll);
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (visibilityHandler) {
        document.removeEventListener("visibilitychange", visibilityHandler);
      }
      socket?.close();
      priceLinesRef.current = [];
      seriesRef.current = null;
      chart?.remove();
    };
  }, [symbol, interval, attempt]);

  return (
    <div className="relative h-80 overflow-hidden rounded-2xl border border-line bg-panel sm:h-96">
      <div ref={hostRef} className="h-full w-full" />
      {feed === "loading" ? (
        <div className="absolute inset-0 flex items-center justify-center bg-panel text-fog">
          Loading candles…
        </div>
      ) : null}
      {feed === "error" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-panel px-6 text-center">
          <p className="text-paper">The market feed didn’t answer.</p>
          <button
            type="button"
            className="h-11 rounded-xl bg-copper px-4 font-semibold text-copper-ink"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Try again
          </button>
        </div>
      ) : null}
      {feed === "empty" ? (
        <div className="absolute inset-0 flex items-center justify-center bg-panel px-6 text-center text-fog">
          Market data is temporarily unavailable. Retrying…
        </div>
      ) : null}
    </div>
  );
}
