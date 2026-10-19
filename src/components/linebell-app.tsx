import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, BellRing, Trash2 } from "lucide-react";
import { FakeoutPanel } from "@/components/fakeout-panel";
import { MarketChart, type FeedStatus, type LineMark } from "@/components/market-chart";
import {
  INTERVALS,
  MARKETS,
  conditionLabel,
  formatPrice,
  hitPhrase,
  isAlert,
  isInterval,
  isSymbol,
  migrateSymbol,
  marketBySymbol,
  normalizeAlert,
  parsePrice,
  roundPrice,
  shouldFire,
  toneLabel,
  zoneHot,
  type Alert,
  type BarSnap,
  type Condition,
  type Interval,
  type MarketSymbol,
  type Tick,
  type Tone,
} from "@/lib/markets";
import { holdAwake, setRingVolume, startCustomRingtone, startRingtone, stopRingtone, unlockAudio } from "@/lib/ring";

const STORAGE_KEY = "linebell.v1";

type Saved = {
  alerts: Alert[];
  symbol: MarketSymbol;
  interval: Interval;
  condition: Condition;
  tone: Tone;
  repeat: boolean;
  volume: number;
  customTone: { url: string; name: string } | null;
};

function loadSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<Saved>;
    const alerts = Array.isArray(data.alerts)
      ? data.alerts.flatMap((value) => {
          if (!value || typeof value !== "object") return [];
          const alert = value as Partial<Alert>;
          const migratedSymbol = migrateSymbol(alert.symbol);
          if (!migratedSymbol) return [];
          const migrated = { ...alert, symbol: migratedSymbol };
          return isAlert(migrated) ? [normalizeAlert(migrated)] : [];
        })
      : [];
    return {
      alerts,
      symbol: data.symbol && isSymbol(data.symbol) ? data.symbol : migrateSymbol(data.symbol) ?? "BTCUSD",
      interval: data.interval && isInterval(data.interval) ? data.interval : "1m",
      condition:
        data.condition === "touch" || data.condition === "cross-up" || data.condition === "cross-down"
          ? data.condition
          : "touch",
      tone: data.tone === "phone" || data.tone === "bell" || data.tone === "siren" ? data.tone : "phone",
      repeat: data.repeat !== false,
      volume: typeof data.volume === "number" ? data.volume : 0.8,
      customTone:
        data.customTone &&
        typeof data.customTone === "object" &&
        typeof data.customTone.url === "string"
          ? {
              url: data.customTone.url,
              name:
                typeof data.customTone.name === "string" ? data.customTone.name : "Custom sound",
            }
          : null,
    };
  } catch {
    return null;
  }
}

function snap(tick: { high: number; low: number; close: number }): BarSnap {
  return { high: tick.high, low: tick.low, close: tick.close };
}

export function LinebellApp() {
  const [tab, setTab] = useState<"alerts" | "fakeout">("alerts");
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col">
      <nav className="flex gap-2 px-4 pt-5 sm:px-6 lg:pt-6" aria-label="Sections">
        <button
          type="button"
          aria-pressed={tab === "alerts"}
          onClick={() => setTab("alerts")}
          className={`h-11 rounded-xl px-5 font-medium ${
            tab === "alerts" ? "bg-paper text-ink" : "bg-raised text-fog"
          }`}
        >
          Price Alerts
        </button>
        <button
          type="button"
          aria-pressed={tab === "fakeout"}
          onClick={() => setTab("fakeout")}
          className={`h-11 rounded-xl px-5 font-medium ${
            tab === "fakeout" ? "bg-paper text-ink" : "bg-raised text-fog"
          }`}
        >
          Anti-Fakeout
        </button>
      </nav>
      {tab === "alerts" ? <Desk /> : <FakeoutPanel />}
    </div>
  );
}

function Desk() {
  const [symbol, setSymbol] = useState<MarketSymbol>("BTCUSD");
  const [interval, setInterval] = useState<Interval>("1m");
  const [condition, setCondition] = useState<Condition>("touch");
  const [tone, setTone] = useState<Tone>("phone");
  const [repeat, setRepeat] = useState(true);
  const [volume, setVolume] = useState(0.8);
  const [customTone, setCustomTone] = useState<{ url: string; name: string } | null>(null);
  const [toneNote, setToneNote] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [priceText, setPriceText] = useState("");
  const [quote, setQuote] = useState<Tick | null>(null);
  const [status, setStatus] = useState<FeedStatus>("connecting");
  const [ringingId, setRingingId] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [testing, setTesting] = useState(false);
  const [ready, setReady] = useState(false);

  const alertsRef = useRef(alerts);
  const ringingRef = useRef<string | null>(null);
  const prevRef = useRef<BarSnap | null>(null);
  const quoteRef = useRef<Tick | null>(null);
  const volumeRef = useRef(volume);
  const toneRef = useRef(tone);
  const customToneRef = useRef(customTone);
  const testStop = useRef<(() => void) | null>(null);
  alertsRef.current = alerts;
  volumeRef.current = volume;
  toneRef.current = tone;
  customToneRef.current = customTone;
  quoteRef.current = quote;

  const market = marketBySymbol(symbol);
  const parsed = parsePrice(priceText, symbol);
  const ringing = alerts.find((alert) => alert.id === ringingId) ?? null;
  const armedHere = alerts.some((alert) => alert.armed && alert.symbol === symbol);

  useEffect(() => {
    const saved = loadSaved();
    if (saved) {
      setSymbol(saved.symbol);
      setInterval(saved.interval);
      setCondition(saved.condition);
      setTone(saved.tone);
      setRepeat(saved.repeat);
      setVolume(saved.volume);
      setCustomTone(saved.customTone);
      setAlerts(saved.alerts);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const payload: Saved = { alerts, symbol, interval, condition, tone, repeat, volume, customTone };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [ready, alerts, symbol, interval, condition, tone, repeat, volume, customTone]);

  useEffect(() => {
    void holdAwake(alerts.some((alert) => alert.armed));
  }, [alerts]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && alertsRef.current.some((alert) => alert.armed)) {
        void holdAwake(true);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void holdAwake(false);
      stopRingtone();
    };
  }, []);

  useEffect(() => {
    if (!ringing) return;
    const previous = document.title;
    document.title = `RING · ${marketBySymbol(ringing.symbol).short}`;
    return () => {
      document.title = previous;
    };
  }, [ringing]);

  const chartLines = useMemo<LineMark[]>(
    () =>
      alerts
        .filter((alert) => alert.symbol === symbol)
        .map((alert) => ({
          id: alert.id,
          price: alert.price,
          selected: alert.id === selectedId,
          hot: alert.id === ringingId,
          armed: alert.armed,
        })),
    [alerts, symbol, selectedId, ringingId],
  );

  async function enableSound() {
    const ok = await unlockAudio();
    setSoundOn(ok);
    if (alertsRef.current.some((alert) => alert.armed)) void holdAwake(true);
    return ok;
  }

  function baseline() {
    if (quoteRef.current && quoteRef.current.symbol === symbol) {
      prevRef.current = snap(quoteRef.current);
    }
  }

  function beginRing(alert: Alert) {
    ringingRef.current = alert.id;
    setRingingId(alert.id);
    stopRingtone();
    testStop.current?.();
    testStop.current = null;
    setTesting(false);
    try {
      if (customToneRef.current) {
        startCustomRingtone(customToneRef.current.url, volumeRef.current);
      } else {
        startRingtone(alert.tone, volumeRef.current);
      }
    } catch {
      /* audio unlock failed; the screen alarm still shows */
    }
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate([200, 80, 200, 80, 400]);
    }
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        new Notification("Linebell", {
          body: `${marketBySymbol(alert.symbol).name} ${hitPhrase(alert.condition)} at ${formatPrice(alert.price, alert.symbol)}`,
        });
      } catch {
        /* notification display is optional */
      }
    }
  }

  function stopRing() {
    stopRingtone();
    ringingRef.current = null;
    setRingingId(null);
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(0);
  }

  function onTick(tick: Tick) {
    setQuote((current) => ({
      ...tick,
      change: tick.change ?? (current?.symbol === tick.symbol ? current.change : null),
    }));
    if (tick.symbol !== symbol) return;
    if (ringingRef.current) {
      prevRef.current = snap(tick);
      return;
    }
    const prev = prevRef.current;
    prevRef.current = snap(tick);
    if (!prev) return;

    let changed = false;
    let hit: Alert | null = null;
    const next = alertsRef.current.map((alert) => {
      if (alert.symbol !== tick.symbol || !alert.armed) return alert;
      if (alert.latch) {
        if (!zoneHot(alert.condition, alert.price, tick)) {
          changed = true;
          return { ...alert, latch: false };
        }
        return alert;
      }
      if (!hit && shouldFire(alert.condition, alert.price, prev, tick)) {
        hit = alert;
        changed = true;
        return { ...alert, armed: alert.repeat, latch: true };
      }
      return alert;
    });
    if (changed) {
      alertsRef.current = next;
      setAlerts(next);
    }
    if (hit) beginRing(hit);
  }

  function chooseMarket(next: MarketSymbol) {
    setSymbol(next);
    setSelectedId(null);
    setPriceText("");
    prevRef.current = null;
    setQuote(null);
  }

  function chooseAlert(alert: Alert) {
    setSelectedId(alert.id);
    setSymbol(alert.symbol);
    setPriceText(String(alert.price));
    setCondition(alert.condition);
    setTone(alert.tone);
    setRepeat(alert.repeat);
    prevRef.current = null;
  }

  function onPick(price: number) {
    const rounded = roundPrice(price, symbol);
    setPriceText(String(rounded));
    if (!selectedId) return;
    baseline();
    setAlerts((list) =>
      list.map((alert) =>
        alert.id === selectedId ? { ...alert, price: rounded, latch: false } : alert,
      ),
    );
  }

  async function armLine() {
    const price = parsePrice(priceText, symbol);
    if (price == null) return;
    await enableSound();
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
    baseline();
    const existing = selectedId ? alerts.find((alert) => alert.id === selectedId) : undefined;
    const id = existing?.id ?? crypto.randomUUID();
    const nextAlert: Alert = {
      id,
      symbol,
      price,
      condition,
      tone,
      armed: true,
      repeat,
      latch: false,
    };
    setAlerts((list) => {
      if (list.some((alert) => alert.id === id)) {
        return list.map((alert) => (alert.id === id ? nextAlert : alert));
      }
      return [nextAlert, ...list].slice(0, 24);
    });
    setSelectedId(id);
  }

  async function toggleArmed(alert: Alert) {
    const armed = !alert.armed;
    if (armed) {
      await enableSound();
      baseline();
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        void Notification.requestPermission();
      }
    }
    setAlerts((list) =>
      list.map((item) => (item.id === alert.id ? { ...item, armed, latch: false } : item)),
    );
  }

  function removeAlert(id: string) {
    if (ringingRef.current === id) stopRing();
    setAlerts((list) => list.filter((alert) => alert.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function pickCustomTone(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      setToneNote("Please choose an audio file (MP3, WAV, OGG…).");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setToneNote("Please choose a file under 2 MB so it can be stored in the browser.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setCustomTone({ url: reader.result, name: file.name });
        setToneNote(null);
      }
    };
    reader.readAsDataURL(file);
  }

  function clearCustomTone() {
    setCustomTone(null);
    setToneNote(null);
  }

  async function testRing() {
    const ok = await enableSound();
    if (!ok || ringingRef.current) return;
    stopRingtone();
    testStop.current?.();
    const stop = customToneRef.current
      ? startCustomRingtone(customToneRef.current.url, volumeRef.current)
      : startRingtone(toneRef.current, volumeRef.current);
    testStop.current = stop;
    setTesting(true);
    window.setTimeout(() => {
      stop();
      if (testStop.current === stop) testStop.current = null;
      setTesting(false);
    }, 2200);
  }

  const mine = alerts.filter((alert) => alert.symbol === symbol);
  const others = alerts.filter((alert) => alert.symbol !== symbol);
  const up = (quote?.change ?? 0) >= 0;
  const distance =
    quote && parsed
      ? quote.price - parsed
      : quote && selectedId
        ? quote.price - (alerts.find((alert) => alert.id === selectedId)?.price ?? quote.price)
        : null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-start lg:py-6">
      <section className="flex min-w-0 flex-1 flex-col gap-4">
        <header className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-copper text-copper-ink">
                <Bell className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold tracking-widest text-copper">LINEBELL</p>
                <h1 className="text-xl font-semibold text-paper">Set a line. It rings.</h1>
              </div>
            </div>
            <p className="flex items-center gap-2 text-sm text-fog">
              <span
                className={`inline-block size-2 rounded-full ${
                  status === "live" ? "live-dot bg-mint" : status === "offline" ? "bg-heat" : "bg-fog"
                }`}
                aria-hidden="true"
              />
              <span>
                {status === "live" ? "Live" : status === "offline" ? "Offline" : status === "closed" ? "Closed" : "Connecting"}
              </span>
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {MARKETS.filter((item) => item.venue === "coinbase").map((item) => {
                const active = item.symbol === symbol;
                return (
                  <button
                    key={item.symbol}
                    type="button"
                    aria-pressed={active}
                    onClick={() => chooseMarket(item.symbol)}
                    className={`h-11 shrink-0 rounded-full px-4 font-medium ${
                      active ? "bg-paper text-ink" : "bg-raised text-fog"
                    }`}
                  >
                    {item.short}
                  </button>
                );
              })}
            </div>
            <p className="text-sm text-fog">Forex and gold</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {MARKETS.filter((item) => item.venue === "yahoo").map((item) => {
                const active = item.symbol === symbol;
                return (
                  <button
                    key={item.symbol}
                    type="button"
                    aria-pressed={active}
                    onClick={() => chooseMarket(item.symbol)}
                    className={`h-11 shrink-0 rounded-full px-4 font-medium ${
                      active ? "bg-paper text-ink" : "bg-raised text-fog"
                    }`}
                  >
                    {item.short}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-fog">
                {market.name}
                <span className="text-line"> · </span>
                {market.short}
              </p>
              <p className="font-mono text-4xl font-medium tracking-tight text-paper sm:text-5xl">
                {quote ? formatPrice(quote.price, symbol) : "—"}
              </p>
            </div>
            <p className={`font-mono text-lg ${up ? "text-mint" : "text-heat"}`}>
              {quote?.change == null ? "" : `${up ? "+" : ""}${quote.change.toFixed(2)}%`}
            </p>
          </div>

          <div className="flex gap-2">
            {INTERVALS.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={item === interval}
                onClick={() => {
                  setInterval(item);
                  prevRef.current = null;
                }}
                className={`h-11 rounded-xl px-4 font-mono ${
                  item === interval ? "bg-raised text-paper" : "text-fog"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </header>

        <MarketChart
          symbol={symbol}
          interval={interval}
          lines={chartLines}
          onTick={onTick}
          onPick={onPick}
          onStatus={setStatus}
        />
        <p className="text-sm text-fog">
          Tap the chart to drop a horizontal price line. Green candles are up, red candles are down.
          {market.symbol === "XAUUSD" ? " Gold is the spot price." : ""}
          {status === "closed" ? " This market is closed. The ring waits until price moves again." : ""}
        </p>
        {distance != null && quote ? (
          <p className="font-mono text-sm text-fog" aria-live="polite">
            {Math.abs(distance) < quote.price * 0.00005
              ? "Price is on your line"
              : `${formatPrice(Math.abs(distance), symbol)} ${distance > 0 ? "above" : "below"} your line`}
          </p>
        ) : null}
      </section>

      <aside className="flex w-full flex-col gap-4 rounded-2xl border border-line bg-panel p-4 lg:w-96">
        {armedHere && !soundOn ? (
          <button
            type="button"
            onClick={() => void enableSound()}
            className="h-12 rounded-xl bg-copper px-4 text-left font-semibold text-copper-ink"
          >
            Tap once so the ringtone can play
          </button>
        ) : null}

        <div className="flex flex-col gap-2">
          <label htmlFor="line-price" className="text-sm text-fog">
            Price line
          </label>
          <input
            id="line-price"
            inputMode="decimal"
            value={priceText}
            placeholder={quote ? formatPrice(quote.price, symbol) : "Type a price"}
            onChange={(event) => setPriceText(event.target.value)}
            className="h-12 rounded-xl border border-line bg-ink px-3 font-mono text-paper outline-none placeholder:text-fog focus:border-copper"
          />
          <div className="flex flex-wrap gap-1">
            {quote ? (
              <button
                type="button"
                onClick={() => onPick(quote.price)}
                className="h-11 px-1 text-sm text-copper"
              >
                Use the live price
              </button>
            ) : null}
            {selectedId ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedId(null);
                  setPriceText("");
                }}
                className="h-11 px-1 text-sm text-copper"
              >
                New line instead
              </button>
            ) : null}
          </div>
        </div>

        <label className="flex flex-col gap-2 text-sm text-fog">
          Ring when price
          <select
            value={condition}
            onChange={(event) => setCondition(event.target.value as Condition)}
            className="h-12 rounded-xl border border-line bg-ink px-3 text-paper outline-none focus:border-copper"
          >
            <option value="touch">Touches the line</option>
            <option value="cross-up">Crosses above</option>
            <option value="cross-down">Crosses below</option>
          </select>
        </label>

        <label className="flex flex-col gap-2 text-sm text-fog">
          Sound
          <select
            value={tone}
            onChange={(event) => setTone(event.target.value as Tone)}
            className="h-12 rounded-xl border border-line bg-ink px-3 text-paper outline-none focus:border-copper"
          >
            <option value="phone">Ringtone</option>
            <option value="bell">Bell</option>
            <option value="siren">Siren</option>
          </select>
        </label>

        <div className="flex flex-col gap-2 text-sm text-fog">
          <span>Custom sound (replaces the tone above)</span>
          {customTone ? (
            <div className="flex h-12 items-center justify-between gap-2 rounded-xl border border-line bg-ink px-3">
              <span className="truncate text-paper">{customTone.name}</span>
              <button
                type="button"
                onClick={clearCustomTone}
                className="shrink-0 text-copper hover:underline"
              >
                Remove
              </button>
            </div>
          ) : (
            <input
              type="file"
              accept="audio/*"
              onChange={(event) => {
                pickCustomTone(event.target.files?.[0]);
                event.target.value = "";
              }}
              className="h-12 rounded-xl border border-line bg-ink px-3 py-3 text-paper file:mr-3 file:rounded-lg file:border-0 file:bg-copper file:px-3 file:py-1 file:text-ink"
            />
          )}
          {toneNote ? <span className="text-xs text-copper">{toneNote}</span> : null}
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={repeat}
          onClick={() => setRepeat((value) => !value)}
          className="flex h-12 items-center justify-between rounded-xl border border-line bg-ink px-3 text-left"
        >
          <span>Ring again on the next hit</span>
          <span className={repeat ? "font-semibold text-mint" : "text-fog"}>{repeat ? "On" : "Off"}</span>
        </button>

        <label className="flex flex-col gap-2 text-sm text-fog">
          Volume
          <input
            type="range"
            min={0.2}
            max={1}
            step={0.05}
            value={volume}
            aria-label="Volume"
            onChange={(event) => {
              const next = Number(event.target.value);
              setVolume(next);
              setRingVolume(next);
            }}
            className="h-11 accent-copper"
          />
        </label>

        <button
          type="button"
          disabled={parsed == null}
          onClick={() => void armLine()}
          className="h-12 rounded-xl bg-copper font-semibold text-copper-ink disabled:opacity-40"
        >
          {selectedId ? "Update and arm" : "Arm this line"}
        </button>
        <button
          type="button"
          onClick={() => void testRing()}
          disabled={testing || ringingId != null}
          className="h-12 rounded-xl border border-line bg-raised font-medium text-paper disabled:opacity-40"
        >
          {testing ? "Playing…" : "Test the ringtone"}
        </button>

        <div className="flex flex-col gap-2">
          <h2 className="text-sm text-fog">Lines on {market.short}</h2>
          {mine.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-3 py-4 text-sm text-fog">
              No line yet. Type a price or tap the chart, then arm it.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {mine.map((alert) => (
                <li
                  key={alert.id}
                  className={`flex flex-col gap-2 rounded-xl border bg-ink p-3 ${
                    alert.id === selectedId ? "border-copper" : "border-line"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <button type="button" onClick={() => chooseAlert(alert)} className="min-w-0 text-left">
                      <span className="block font-mono text-lg text-paper">{formatPrice(alert.price, alert.symbol)}</span>
                      <span className="block text-sm text-fog">
                        {conditionLabel(alert.condition)} · {toneLabel(alert.tone)}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${formatPrice(alert.price, alert.symbol)}`}
                      onClick={() => removeAlert(alert.id)}
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line text-fog"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                  <button
                    type="button"
                    aria-pressed={alert.armed}
                    onClick={() => void toggleArmed(alert)}
                    className={`h-11 rounded-xl font-medium ${
                      alert.armed ? "bg-mint text-mint-ink" : "bg-raised text-paper"
                    }`}
                  >
                    {alert.armed ? "Armed — watching" : "Arm"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {others.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h2 className="text-sm text-fog">Paused on other markets</h2>
            <ul className="flex flex-col gap-2">
              {others.map((alert) => (
                <li key={alert.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 text-sm text-fog">
                    {marketBySymbol(alert.symbol).short} · {formatPrice(alert.price, alert.symbol)}
                  </span>
                  <button
                    type="button"
                    onClick={() => chooseAlert(alert)}
                    className="h-11 shrink-0 rounded-xl border border-line px-3 text-paper"
                  >
                    Watch
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="text-sm text-fog">
          Free in this browser. Leave the page open. Linebell plays a ringtone on this device — it can’t dial
          your phone or open the ringtone saved on it.
          {armedHere ? " The screen stays awake while a line here is armed." : ""}
        </p>
      </aside>

      {ringing ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="ring-title"
          className="alarm-frame fixed inset-0 z-40 flex items-center justify-center bg-ink px-6"
        >
          <div className="flex w-full max-w-md flex-col items-center gap-4 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-heat text-heat-ink">
              <BellRing className="size-8" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold tracking-widest text-heat">LINE HIT</p>
              <h2 id="ring-title" className="mt-1 text-3xl font-semibold text-paper">
                {marketBySymbol(ringing.symbol).name} {hitPhrase(ringing.condition)}
              </h2>
              <p className="mt-2 font-mono text-2xl text-copper">{formatPrice(ringing.price, ringing.symbol)}</p>
            </div>
            <button
              type="button"
              onClick={stopRing}
              className="h-14 w-full rounded-xl bg-heat text-lg font-semibold text-heat-ink"
            >
              Stop the ring
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
