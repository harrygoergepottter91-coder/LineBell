import assert from "node:assert/strict";
import { test } from "node:test";
import { coinbaseProductId, isCoinbase, isSymbol, marketBySymbol, migrateSymbol } from "./markets.ts";

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

test("gold uses the Yahoo spot XAU/USD symbol", () => {
  assert.equal(marketBySymbol("XAUUSD").yahoo, "XAUUSD=X");
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
