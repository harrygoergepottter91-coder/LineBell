import assert from "node:assert/strict";
import { test } from "node:test";
import {
  coinbaseProductId,
  isCoinbase,
  isSymbol,
  marketBySymbol,
  migrateSymbol,
  normalizeMarketSymbol,
  yahooTickerForSymbol,
} from "./markets.ts";

test("crypto symbols map to Coinbase USD products", () => {
  const products = {
    BTCUSD: "BTC-USD",
    ETHUSD: "ETH-USD",
    SOLUSD: "SOL-USD",
    BNBUSD: "BNB-USD",
    XRPUSD: "XRP-USD",
    DOGEUSD: "DOGE-USD",
    ADAUSD: "ADA-USD",
    AVAXUSD: "AVAX-USD",
    LINKUSD: "LINK-USD",
  };

  for (const [symbol, product] of Object.entries(products)) {
    assert.equal(coinbaseProductId(symbol), product);
    assert.equal(isCoinbase(symbol), true);
  }
  assert.equal(coinbaseProductId("XAUUSD"), null);
  assert.equal(isCoinbase("EURUSD"), false);
});

test("gold uses a spot provider instead of a Yahoo futures ticker", () => {
  assert.equal(marketBySymbol("XAUUSD").venue, "gold-api");
  assert.equal(yahooTickerForSymbol("XAUUSD"), null);
});

test("Yahoo forex symbols use the required =X suffix", () => {
  const pairs = ["EURUSD", "GBPUSD", "AUDUSD", "NZDUSD", "USDJPY", "USDCAD", "USDCHF"];

  for (const pair of pairs) {
    assert.equal(yahooTickerForSymbol(pair), `${pair}=X`);
  }
});

test("gold aliases normalize to spot gold", () => {
  assert.equal(normalizeMarketSymbol("GOLD"), "XAUUSD");
  assert.equal(normalizeMarketSymbol(" xauusd "), "XAUUSD");
  assert.equal(yahooTickerForSymbol("XAUUSD"), null);
});

test("legacy USDT identifiers migrate to their USD symbols", () => {
  const symbols = [
    "BTC",
    "ETH",
    "SOL",
    "BNB",
    "XRP",
    "DOGE",
    "ADA",
    "AVAX",
    "LINK",
  ];

  for (const symbol of symbols) {
    assert.equal(migrateSymbol(`${symbol}USDT`), `${symbol}USD`);
    assert.equal(isSymbol(`${symbol}USD`), true);
  }
  assert.equal(migrateSymbol("NOT-A-MARKET"), null);
});
