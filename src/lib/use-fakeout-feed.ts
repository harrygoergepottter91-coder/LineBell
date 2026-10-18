import { useEffect, useState } from "react";
import { apiPath } from "@/lib/api-path";
import {
  coinbaseProductId,
  isCoinbase,
  type MarketSymbol,
  type Tick,
} from "@/lib/markets";

export type FakeoutFeedStatus = "connecting" | "live" | "offline" | "closed";

export type FakeoutQuote = { tick: Tick | null; status: FakeoutFeedStatus };

type FeedBody = {
  candles?: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
  }>;
  price?: number;
  change?: number | null;
  closed?: boolean;
};

type CoinbaseTicker = {
  type?: string;
  product_id?: string;
  price?: string;
  time?: string;
};

/**
 * Live quotes for selected symbols, reusing Linebell's market-data API and
 * Coinbase's public ticker WebSocket for crypto markets.
 */
export function useFakeoutFeed(
  symbols: MarketSymbol[],
): Record<string, FakeoutQuote> {
  const key = [...new Set(symbols)].sort().join(",");
  const [quotes, setQuotes] = useState<Record<string, FakeoutQuote>>({});

  useEffect(() => {
    const list = key ? (key.split(",") as MarketSymbol[]) : [];
    if (!list.length) {
      setQuotes({});
      return;
    }

    let dead = false;
    setQuotes(
      Object.fromEntries(
        list.map((symbol) => [
          symbol,
          { tick: null, status: "connecting" as const },
        ]),
      ),
    );

    const patch = (symbol: string, part: Partial<FakeoutQuote>) => {
      if (dead) return;
      setQuotes((current) => {
        const prev = current[symbol] ?? {
          tick: null,
          status: "connecting" as const,
        };
        return { ...current, [symbol]: { ...prev, ...part } };
      });
    };

    const cleanups: Array<() => void> = [];

    for (const symbol of list) {
      let socketOpen = false;
      let hasData = false;
      let marketClosed = false;
      let latestBar: { time: number; open: number; high: number; low: number; close: number } | null =
        null;
      let socket: WebSocket | null = null;

      const publish = (
        bar: { open: number; high: number; low: number; close: number },
        change: number | null,
      ) => {
        if (dead) return;
        patch(symbol, {
          tick: {
            symbol,
            price: bar.close,
            change,
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
          },
          status: marketClosed ? "closed" : "live",
        });
      };

      const load = async (full: boolean) => {
        const res = await fetch(
          apiPath(`/api/market?symbol=${symbol}&interval=1m`),
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error(`feed returned HTTP ${res.status}`);
        const body = (await res.json()) as FeedBody;
        const candles = body.candles ?? [];
        if (!candles.length) throw new Error("empty market feed");
        if (dead) return;

        const last = candles[candles.length - 1]!;
        hasData = true;
        latestBar = last;
        marketClosed = Boolean(body.closed);
        const change =
          Number.isFinite(body.change) ? (body.change ?? null) : null;
        if (full || !socketOpen) publish(last, change);
        else patch(symbol, { status: marketClosed ? "closed" : "live" });
      };

      const markOffline = (error: unknown) => {
        if (dead) return;
        console.warn(`[fakeout] Feed request failed for ${symbol}`, error);
        patch(symbol, {
          status: hasData ? (marketClosed ? "closed" : "live") : "offline",
        });
      };

      patch(symbol, { status: "connecting" });
      void load(true).catch(markOffline);

      const product = coinbaseProductId(symbol);
      if (isCoinbase(symbol) && product) {
        try {
          socket = new WebSocket("wss://ws-feed.exchange.coinbase.com");
          socket.onopen = () => {
            socket?.send(
              JSON.stringify({
                type: "subscribe",
                product_ids: [product],
                channels: ["ticker"],
              }),
            );
            socketOpen = true;
            if (!dead) patch(symbol, { status: "live" });
          };
          socket.onclose = () => {
            socketOpen = false;
          };
          socket.onerror = () => {
            socketOpen = false;
            socket?.close();
          };
          socket.onmessage = (event) => {
            if (dead) return;

            let message: unknown;
            try {
              message = JSON.parse(String(event.data));
            } catch (error) {
              console.warn(`[fakeout] Malformed Coinbase message for ${symbol}`, error);
              return;
            }
            if (!message || typeof message !== "object") return;

            const ticker = message as CoinbaseTicker;
            if (ticker.type !== "ticker" || ticker.product_id !== product) return;
            const price = Number(ticker.price);
            const time = Date.parse(String(ticker.time)) / 1000;
            if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(time)) {
              console.warn(`[fakeout] Invalid Coinbase ticker for ${symbol}`, message);
              return;
            }

            const bucket = Math.floor(time / 60) * 60;
            if (latestBar && bucket < latestBar.time) return;
            latestBar =
              latestBar && bucket === latestBar.time
                ? {
                    ...latestBar,
                    high: Math.max(latestBar.high, price),
                    low: Math.min(latestBar.low, price),
                    close: price,
                  }
                : {
                    time: bucket,
                    open: price,
                    high: price,
                    low: price,
                    close: price,
                  };
            publish(latestBar, null);
          };
        } catch (error) {
          socketOpen = false;
          console.warn(`[fakeout] Coinbase WebSocket unavailable for ${symbol}`, error);
        }
      }

      const poll = window.setInterval(() => {
        if (dead || socketOpen) return;
        void load(false).catch(markOffline);
      }, 5000);

      cleanups.push(() => {
        window.clearInterval(poll);
        socket?.close();
      });
    }

    return () => {
      dead = true;
      for (const cleanup of cleanups) cleanup();
    };
  }, [key]);

  return quotes;
}