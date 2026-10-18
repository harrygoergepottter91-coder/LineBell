import { useEffect, useMemo, useRef, useState } from "react";
import { BellRing, Check, Pause, Play, RotateCcw, Trash2 } from "lucide-react";
import {
  FAKEOUT_MAX_HISTORY,
  FAKEOUT_MAX_MONITORS,
  fakeoutDirectionLabel,
  fakeoutIsActive,
  fakeoutMessage,
  fakeoutStatusLabel,
  rearmFakeout,
  stepFakeout,
  validateFakeoutInput,
  type FakeoutDirection,
  type FakeoutEvent,
  type FakeoutMonitor,
} from "@/lib/fakeout";
import { useFakeoutFeed } from "@/lib/use-fakeout-feed";
import {
  MARKETS,
  formatPrice,
  marketBySymbol,
  parsePrice,
  type MarketSymbol,
} from "@/lib/markets";
import { startRingtone, stopRingtone, unlockAudio } from "@/lib/ring";

const STORAGE_KEY = "linebell.fakeout.v1";

type SavedFakeout = { monitors: FakeoutMonitor[]; history: FakeoutEvent[] };

const inputCls =
  "h-12 w-full rounded-xl border border-line bg-ink px-3 text-paper outline-none focus:border-copper";

function loadSaved(): SavedFakeout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { monitors: [], history: [] };
    const data = JSON.parse(raw) as Partial<SavedFakeout>;
    return {
      monitors: Array.isArray(data.monitors) ? data.monitors : [],
      history: Array.isArray(data.history) ? data.history.slice(0, FAKEOUT_MAX_HISTORY) : [],
    };
  } catch {
    return { monitors: [], history: [] };
  }
}

function statusBadgeCls(status: FakeoutMonitor["status"]): string {
  if (status === "confirmed") return "bg-copper text-copper-ink";
  if (status === "triggered") return "bg-heat text-heat-ink";
  return "bg-raised text-fog";
}

function fmtTime(ms: number | null): string {
  return ms == null ? "—" : new Date(ms).toLocaleTimeString();
}

export function FakeoutPanel() {
  const [symbol, setSymbol] = useState<MarketSymbol>("XAUUSD");
  const [levelText, setLevelText] = useState("");
  const [direction, setDirection] = useState<FakeoutDirection>("up");
  const [confirmText, setConfirmText] = useState("");
  const [returnText, setReturnText] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const [monitors, setMonitors] = useState<FakeoutMonitor[]>([]);
  const [history, setHistory] = useState<FakeoutEvent[]>([]);
  const [ready, setReady] = useState(false);
  const [alarmId, setAlarmId] = useState<string | null>(null);

  const monitorsRef = useRef(monitors);
  const alarmIdRef = useRef<string | null>(null);
  const alarmStopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const saved = loadSaved();
    setMonitors(saved.monitors);
    setHistory(saved.history);
    setReady(true);
  }, []);

  useEffect(() => {
    monitorsRef.current = monitors;
  }, [monitors]);

  useEffect(() => {
    if (!ready) return;
    const payload: SavedFakeout = { monitors, history: history.slice(0, FAKEOUT_MAX_HISTORY) };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* storage full — monitoring still works for this session */
    }
  }, [ready, monitors, history]);

  const activeSymbols = useMemo(
    () => [...new Set(monitors.filter(fakeoutIsActive).map((m) => m.symbol))],
    [monitors],
  );
  const quotes = useFakeoutFeed(activeSymbols);

  function silenceAlarm(id: string) {
    if (alarmIdRef.current !== id) return;
    stopRingtone();
    alarmStopRef.current = null;
    alarmIdRef.current = null;
    setAlarmId(null);
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(0);
  }

  function fireAlarm(monitor: FakeoutMonitor) {
    stopRingtone();
    alarmStopRef.current = null;
    try {
      alarmStopRef.current = startRingtone("siren", 0.95);
    } catch {
      /* audio blocked — the card still flashes */
    }
    alarmIdRef.current = monitor.id;
    setAlarmId(monitor.id);
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate([200, 80, 200, 80, 400]);
    }
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        new Notification("Linebell — Anti-Fakeout", { body: fakeoutMessage(monitor) });
      } catch {
        /* notification display is optional */
      }
    }
  }

  useEffect(() => {
    let changed = false;
    const fired: FakeoutMonitor[] = [];
    const next = monitorsRef.current.map((monitor) => {
      if (!fakeoutIsActive(monitor)) return monitor;
      const price = quotes[monitor.symbol]?.tick?.price;
      if (price == null || !Number.isFinite(price) || price <= 0) return monitor;
      const result = stepFakeout(monitor, price);
      if (result.monitor !== monitor) changed = true;
      if (result.fired) fired.push(result.monitor);
      return result.monitor;
    });
    if (changed) setMonitors(next);
    for (const monitor of fired) {
      setHistory((list) =>
        [
          {
            id: crypto.randomUUID(),
            monitorId: monitor.id,
            symbol: monitor.symbol,
            level: monitor.level,
            direction: monitor.direction,
            breakoutPrice: monitor.breakoutPrice ?? 0,
            returnPrice: monitor.returnPrice ?? 0,
            time: monitor.triggerTime ?? Date.now(),
          },
          ...list,
        ].slice(0, FAKEOUT_MAX_HISTORY),
      );
      fireAlarm(monitor);
    }
  }, [quotes]);

  async function startMonitoring() {
    setFormError(null);
    const level = parsePrice(levelText, symbol);
    const confirmDistance = parsePrice(confirmText, symbol);
    const returnDistance = returnText.trim() === "" ? null : parsePrice(returnText, symbol);
    if (level == null || confirmDistance == null || returnDistance == null) {
      setFormError("Enter the level and both distances as positive numbers.");
      return;
    }
    const invalid = validateFakeoutInput({ level, confirmDistance, returnDistance });
    if (invalid) {
      setFormError(invalid);
      return;
    }
    if (monitorsRef.current.length >= FAKEOUT_MAX_MONITORS) {
      setFormError(`Up to ${FAKEOUT_MAX_MONITORS} monitors at once — remove one first.`);
      return;
    }
    await unlockAudio();
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
    const monitor: FakeoutMonitor = {
      id: crypto.randomUUID(),
      symbol,
      level,
      direction,
      confirmDistance,
      returnDistance,
      status: "waiting",
      paused: false,
      breakoutPrice: null,
      breakoutTime: null,
      returnPrice: null,
      triggerTime: null,
    };
    setMonitors((list) => [monitor, ...list]);
  }

  function togglePause(monitor: FakeoutMonitor) {
    setMonitors((list) =>
      list.map((m) => (m.id === monitor.id ? { ...m, paused: !m.paused } : m)),
    );
  }

  function resetMonitor(monitor: FakeoutMonitor) {
    silenceAlarm(monitor.id);
    setMonitors((list) => list.map((m) => (m.id === monitor.id ? rearmFakeout(m) : m)));
  }

  function removeMonitor(monitor: FakeoutMonitor) {
    silenceAlarm(monitor.id);
    setMonitors((list) => list.filter((m) => m.id !== monitor.id));
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-4 px-4 py-5 sm:px-6 lg:py-6">
      <section className="flex flex-col gap-4 rounded-2xl border border-line bg-panel p-4">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-paper">Anti-Fakeout Alert</h1>
          <p className="text-sm text-fog">
            Detects <span className="text-copper">possible</span> false breakouts: price confirms a
 breakout past your level, then snaps back across it. A monitoring aid —{" "}
            <span className="text-heat">not a guaranteed trading signal</span>. Alerts ring only
            while this page is open.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <label className="flex flex-col gap-2 text-sm text-fog">
            Market
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value as MarketSymbol)}
              className={inputCls}
            >
              {MARKETS.map((m) => (
                <option key={m.symbol} value={m.symbol}>
                  {m.name} · {m.short}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm text-fog">
            Key price level
            <input
              value={levelText}
              onChange={(e) => setLevelText(e.target.value)}
              inputMode="decimal"
              placeholder="e.g. 4400"
              className={`font-mono ${inputCls}`}
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-fog">
            Direction
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as FakeoutDirection)}
              className={inputCls}
            >
              <option value="up">Breakout above</option>
              <option value="down">Breakout below</option>
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm text-fog">
            Confirmation distance
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              inputMode="decimal"
              placeholder="e.g. 2.00"
              className={`font-mono ${inputCls}`}
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-fog">
            Return distance
            <input
              value={returnText}
              onChange={(e) => setReturnText(e.target.value)}
              inputMode="decimal"
              placeholder="e.g. 1.00"
              className={`font-mono ${inputCls}`}
            />
          </label>
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void startMonitoring()}
            className="h-12 w-full rounded-xl bg-copper font-semibold text-copper-ink sm:w-64"
          >
            Start Monitoring
          </button>
          {formError ? <p className="text-sm text-heat">{formError}</p> : null}
          <p className="text-xs text-fog">
            A plain touch of the level never counts — the price must first move the confirmation
            distance beyond it. If it then comes back across the level by the return distance, the
            alarm fires once.
          </p>
        </div>
      </section>

      {monitors.length ? (
        <section className="grid gap-4 sm:grid-cols-2">
          {monitors.map((monitor) => {
            const quote = quotes[monitor.symbol];
            const ringing = alarmId === monitor.id;
            return (
              <article
                key={monitor.id}
                className={`flex flex-col gap-3 rounded-2xl border p-4 ${
                  monitor.status === "triggered"
                    ? "animate-pulse border-heat bg-raised"
                    : "border-line bg-panel"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm text-fog">
                      {marketBySymbol(monitor.symbol).name} ·{" "}
                      {fakeoutDirectionLabel(monitor.direction)}
                    </p>
                    <p className="font-mono text-2xl tracking-tight text-paper">
                      {formatPrice(monitor.level, monitor.symbol)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${statusBadgeCls(monitor.status)}`}
                  >
                    {fakeoutStatusLabel(monitor.status)}
                    {monitor.paused && monitor.status !== "triggered" ? " · paused" : ""}
                  </span>
                </div>

                <p className="font-mono text-sm text-fog" aria-live="polite">
                  {quote?.tick
                    ? `Now ${formatPrice(quote.tick.price, monitor.symbol)}`
                    : "Waiting for price…"}
                  <span
                    className={`ml-2 inline-block h-2 w-2 rounded-full ${
                      quote?.status === "live"
                        ? "bg-mint"
                        : quote?.status === "offline"
                          ? "bg-heat"
                          : "bg-fog"
                    }`}
                  />
                  {quote?.status === "closed" ? (
                    <span className="ml-2">market closed</span>
                  ) : null}
                </p>

                {monitor.status === "confirmed" ? (
                  <p className="text-sm text-copper">
                    Broke out at {formatPrice(monitor.breakoutPrice ?? 0, monitor.symbol)} ·{" "}
                    {fmtTime(monitor.breakoutTime)} — watching for a return…
                  </p>
                ) : null}

                {monitor.status === "triggered" ? (
                  <div className="flex flex-col gap-1 text-sm">
                    <p className="flex items-center gap-2 font-semibold text-heat">
                      <BellRing className="h-4 w-4" /> {fakeoutMessage(monitor)}
                    </p>
                    <p className="font-mono text-xs text-fog">
                      Breakout {formatPrice(monitor.breakoutPrice ?? 0, monitor.symbol)} at{" "}
                      {fmtTime(monitor.breakoutTime)} → return{" "}
                      {formatPrice(monitor.returnPrice ?? 0, monitor.symbol)} at{" "}
                      {fmtTime(monitor.triggerTime)}
                    </p>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  {monitor.status !== "triggered" ? (
                    <button
                      type="button"
                      onClick={() => togglePause(monitor)}
                      className="flex h-10 items-center gap-1 rounded-xl bg-raised px-3 text-sm text-paper"
                    >
                      {monitor.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                      {monitor.paused ? "Resume" : "Pause"}
                    </button>
                  ) : null}
                  {ringing ? (
                                     <button
                      type="button"
                      onClick={() => silenceAlarm(monitor.id)}
                      className="flex h-10 items-center gap-1 rounded-xl bg-heat px-3 text-sm font-semibold text-heat-ink"
                    >
                      <Check className="h-4 w-4" /> Acknowledge
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => resetMonitor(monitor)}
                    className="flex h-10 items-center gap-1 rounded-xl bg-raised px-3 text-sm text-paper"
                  >
                    <RotateCcw className="h-4 w-4" /> Reset
                  </button>
 <button
                    type="button"
                    onClick={() => removeMonitor(monitor)}
                    className="flex h-10 items-center gap-1 rounded-xl px-3 text-sm text-fog"
                  >
                    <Trash2 className="h-4 w-4" /> Remove
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <p className="rounded-2xl border border-dashed border-line p-4 text-sm text-fog">
          No Anti-Fakeout monitors yet. Configure one above and press Start Monitoring — up to{" "}
          {FAKEOUT_MAX_MONITORS} can run at once, for the same or different markets.
        </p>
      )}

      {history.length ? (
        <section className="flex flex-col gap-2 rounded-2xl border border-line bg-panel p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-paper">Alert history</h2>
            <button
              type="button"
              onClick={() => setHistory([])}
              className="text-sm text-copper hover:underline"
            >
              Clear history
            </button>
          </div>
          <ul className="flex flex-col gap-1 text-sm text-fog">
            {history.map((event) => (
              <li key={event.id} className="font-mono text-xs">
                {new Date(event.time).toLocaleString()} · {event.symbol}{" "}
                {fakeoutDirectionLabel(event.direction)} {formatPrice(event.level, event.symbol)} ·
                breakout {formatPrice(event.breakoutPrice, event.symbol)} → return{" "}
                {formatPrice(event.returnPrice, event.symbol)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-2xl border border-line bg-panel p-4 text-sm text-fog">
        <h2 className="mb-2 font-semibold text-paper">How detection works</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            <span className="text-paper">Waiting for Breakout</span> — the price must move at least
            the confirmation distance past your level. Touching the level is never enough.
          </li>
          <li>
            <span className="text-paper">Breakout Confirmed</span> — the breakout is recorded and
            the monitor watches for a snap-back.
          </li>
          <li>
            <span className="text-paper">Possible Fakeout Detected</span> — price returns across the
            level by the return distance. The alarm rings once until you acknowledge or reset.
          </li>
          <li>
            <span className="text-paper">Reset</span> re-arms the same settings for the next
            breakout; <span className="text-paper">Pause</span> freezes a monitor without losing
            its state.
          </li>
        </ol>
        <p className="mt-2 text-xs">
          Quotes come from the same live feed as the main desk (Coinbase for crypto, Yahoo Finance
          for forex/gold). Monitors run in this browser tab — they cannot run after the tab is
          closed.
        </p>
      </section>
    </main>
  );
}