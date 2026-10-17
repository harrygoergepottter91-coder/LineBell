import { i as __toESM } from "../_runtime.mjs";
import { W as require_react, y as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { i as BellRing, n as Trash2, r as Bell } from "../_libs/lucide-react.mjs";
import { _ as shouldFire, a as conditionLabel, b as previewPathPrefix, c as isAlert, d as isSymbol, f as marketBySymbol, g as roundPrice, h as parsePrice, i as coinbaseProductId, l as isCoinbase, m as normalizeAlert, n as INTERVALS, o as formatPrice, p as migrateSymbol, r as MARKETS, s as hitPhrase, u as isInterval, v as toneLabel, y as zoneHot } from "./router-B9R-dVkb.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-5zpDKrC3.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function apiPath(path) {
	if (typeof window === "undefined") return path;
	return `${previewPathPrefix(window.location.hostname, window.location.pathname) ?? ""}${path}`;
}
var INTERVAL_SECONDS = {
	"1m": 60,
	"5m": 300,
	"15m": 900,
	"1h": 3600
};
function cssColor(name, fallback) {
	return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}
function palette() {
	return {
		panel: cssColor("--color-panel", "#151c19"),
		fog: cssColor("--color-fog", "#93a399"),
		line: cssColor("--color-line", "#2c3a34"),
		mint: cssColor("--color-mint", "#3dcc8e"),
		heat: cssColor("--color-heat", "#ff5c45"),
		copper: cssColor("--color-copper", "#e4a15c")
	};
}
function MarketChart({ symbol, interval, lines, onTick, onPick, onStatus }) {
	const hostRef = (0, import_react.useRef)(null);
	const onTickRef = (0, import_react.useRef)(onTick);
	const onPickRef = (0, import_react.useRef)(onPick);
	const onStatusRef = (0, import_react.useRef)(onStatus);
	const linesRef = (0, import_react.useRef)(lines);
	const seriesRef = (0, import_react.useRef)(null);
	const priceLinesRef = (0, import_react.useRef)([]);
	const [feed, setFeed] = (0, import_react.useState)("loading");
	const [attempt, setAttempt] = (0, import_react.useState)(0);
	onTickRef.current = onTick;
	onPickRef.current = onPick;
	onStatusRef.current = onStatus;
	linesRef.current = lines;
	const paintLines = () => {
		const series = seriesRef.current;
		if (!series) return;
		for (const priceLine of priceLinesRef.current) series.removePriceLine(priceLine);
		const colors = palette();
		priceLinesRef.current = linesRef.current.filter((line) => Number.isFinite(line.price) && line.price > 0).map((line) => series.createPriceLine({
			price: line.price,
			color: line.hot ? colors.heat : line.selected ? colors.copper : colors.fog,
			lineWidth: line.selected || line.hot ? 2 : 1,
			lineStyle: 2,
			axisLabelVisible: true,
			title: line.hot ? "Hit" : line.armed ? "Armed" : "Line"
		}));
	};
	(0, import_react.useEffect)(() => {
		paintLines();
	}, [lines]);
	(0, import_react.useEffect)(() => {
		const host = hostRef.current;
		if (!host) return;
		let dead = false;
		let chart = null;
		let socket = null;
		let poll = null;
		let reconnectTimer = null;
		let reconnectAttempt = 0;
		let socketOpen = false;
		let hasData = false;
		let marketClosed = false;
		let lastSeriesTime = 0;
		let lastChange = null;
		let latestBar = null;
		onStatusRef.current("connecting");
		setFeed("loading");
		const publish = (bar, change, price = bar.close) => {
			onTickRef.current({
				symbol,
				price,
				change,
				open: bar.open,
				high: Math.max(bar.high, price),
				low: Math.min(bar.low, price),
				close: price
			});
		};
		(async () => {
			const charts = await import("../_libs/lightweight-charts.mjs").then((n) => n.t);
			if (dead || !hostRef.current) return;
			const colors = palette();
			chart = charts.createChart(host, {
				autoSize: true,
				layout: {
					background: {
						type: charts.ColorType.Solid,
						color: colors.panel
					},
					textColor: colors.fog,
					fontFamily: "IBM Plex Mono, ui-monospace, monospace"
				},
				grid: {
					vertLines: { color: colors.line },
					horzLines: { color: colors.line }
				},
				rightPriceScale: { borderColor: colors.line },
				timeScale: {
					borderColor: colors.line,
					timeVisible: true,
					secondsVisible: false
				},
				crosshair: { mode: charts.CrosshairMode.Normal }
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
					minMove: 10 ** -marketBySymbol(symbol).digits
				}
			});
			seriesRef.current = series;
			chart.subscribeClick((param) => {
				if (!param.point) return;
				const price = series.coordinateToPrice(param.point.y);
				if (price == null || !Number.isFinite(price) || price <= 0) return;
				onPickRef.current(price);
			});
			const load = async (full) => {
				const res = await fetch(apiPath(`/api/market?symbol=${symbol}&interval=${interval}`), { cache: "no-store" });
				if (!res.ok) throw new Error(`feed returned HTTP ${res.status}`);
				const body = await res.json();
				const uniqueCandles = /* @__PURE__ */ new Map();
				for (const candle of body.candles ?? []) {
					if (!Number.isInteger(candle.time) || candle.time <= 0 || ![
						candle.open,
						candle.high,
						candle.low,
						candle.close
					].every(Number.isFinite) || candle.open <= 0 || candle.low <= 0 || candle.high < candle.low || candle.close <= 0) {
						console.warn(`[market] Ignoring malformed candle for ${symbol}`, candle);
						continue;
					}
					uniqueCandles.set(candle.time, candle);
				}
				const candles = [...uniqueCandles.values()].sort((left, right) => left.time - right.time);
				if (!candles.length) throw new Error("empty");
				if (dead) return;
				const last = candles[candles.length - 1];
				if (full || !hasData) {
					series.setData(candles.map((candle) => ({
						time: candle.time,
						open: candle.open,
						high: candle.high,
						low: candle.low,
						close: candle.close
					})));
					latestBar = last;
					lastSeriesTime = last.time;
					paintLines();
				}
				hasData = true;
				marketClosed = Boolean(body.closed);
				lastChange = Number.isFinite(body.change) ? body.change ?? null : null;
				const price = Number(body.price);
				const quoteTime = Number(body.quoteTime);
				let current = latestBar ?? last;
				if (!socketOpen && !marketClosed && Number.isFinite(price) && price > 0 && Number.isFinite(quoteTime) && quoteTime > 0) {
					const time = Math.floor(quoteTime / INTERVAL_SECONDS[interval]) * INTERVAL_SECONDS[interval];
					if (time >= lastSeriesTime) {
						current = time === latestBar?.time ? {
							...latestBar,
							high: Math.max(latestBar.high, price),
							low: Math.min(latestBar.low, price),
							close: price
						} : {
							time,
							open: price,
							high: price,
							low: price,
							close: price
						};
						series.update({
							time: current.time,
							open: current.open,
							high: current.high,
							low: current.low,
							close: current.close
						});
						latestBar = current;
						lastSeriesTime = current.time;
					}
				}
				if (full || !socketOpen) publish(current, lastChange, Number.isFinite(price) && price > 0 ? price : current.close);
				setFeed("ready");
				onStatusRef.current(marketClosed ? "closed" : "live");
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
			const product = coinbaseProductId(symbol);
			const connect = () => {
				if (dead || !product) return;
				try {
					const ws = new WebSocket("wss://ws-feed.exchange.coinbase.com");
					socket = ws;
					ws.onopen = () => {
						ws.send(JSON.stringify({
							type: "subscribe",
							product_ids: [product],
							channels: ["ticker"]
						}));
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
						const delay = Math.min(1e3 * 2 ** reconnectAttempt, 3e4);
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
						if (dead) return;
						let message;
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
						const msg = message;
						if (msg.type !== "ticker") return;
						const price = Number(msg.price);
						const time = Date.parse(String(msg.time)) / 1e3;
						if (msg.product_id !== product || !Number.isFinite(price) || price <= 0 || !Number.isFinite(time) || time <= 0) {
							console.warn(`[market] Invalid Coinbase ticker mapping/payload for ${symbol}`, message);
							return;
						}
						const bucket = Math.floor(time / INTERVAL_SECONDS[interval]) * INTERVAL_SECONDS[interval];
						if (bucket < lastSeriesTime) return;
						const previous = latestBar;
						const bar = previous && bucket === previous.time ? {
							time: bucket,
							open: previous.open,
							high: Math.max(previous.high, price),
							low: Math.min(previous.low, price),
							close: price
						} : {
							time: bucket,
							open: price,
							high: price,
							low: price,
							close: price
						};
						series.update({
							time: bar.time,
							open: bar.open,
							high: bar.high,
							low: bar.low,
							close: bar.close
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
						const delay = Math.min(1e3 * 2 ** reconnectAttempt, 3e4);
						reconnectAttempt += 1;
						reconnectTimer = window.setTimeout(() => {
							reconnectTimer = null;
							connect();
						}, delay);
					}
				}
			};
			if (isCoinbase(symbol)) connect();
			poll = window.setInterval(() => {
				if (dead || socketOpen) return;
				load(false).catch((error) => {
					console.warn(`[market] Polling feed failed for ${symbol}`, error);
					if (!dead && !socketOpen) onStatusRef.current(hasData ? marketClosed ? "closed" : "live" : "offline");
				});
			}, product ? 4e3 : 5e3);
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
			socket?.close();
			priceLinesRef.current = [];
			seriesRef.current = null;
			chart?.remove();
		};
	}, [
		symbol,
		interval,
		attempt
	]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "relative h-80 overflow-hidden rounded-2xl border border-line bg-panel sm:h-96",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				ref: hostRef,
				className: "h-full w-full"
			}),
			feed === "loading" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "absolute inset-0 flex items-center justify-center bg-panel text-fog",
				children: "Loading candles…"
			}) : null,
			feed === "error" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "absolute inset-0 flex flex-col items-center justify-center gap-3 bg-panel px-6 text-center",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-paper",
					children: "The market feed didn’t answer."
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: "h-11 rounded-xl bg-copper px-4 font-semibold text-copper-ink",
					onClick: () => setAttempt((value) => value + 1),
					children: "Try again"
				})]
			}) : null
		]
	});
}
var ctx = null;
var activeStop = null;
var master = null;
var wakeLock = null;
function context() {
	if (!ctx) {
		const Ctx = window.AudioContext || window.webkitAudioContext;
		if (!Ctx) throw new Error("Audio isn't available in this browser.");
		ctx = new Ctx();
	}
	return ctx;
}
async function unlockAudio() {
	try {
		const audio = context();
		if (audio.state === "suspended") await audio.resume();
		return audio.state === "running";
	} catch {
		return false;
	}
}
function clampVolume(volume) {
	if (!Number.isFinite(volume)) return .8;
	return Math.min(1, Math.max(.05, volume));
}
function tone(audio, dest, freq, start, duration, gain, type = "sine") {
	const osc = audio.createOscillator();
	const amp = audio.createGain();
	osc.type = type;
	osc.frequency.setValueAtTime(freq, start);
	amp.gain.setValueAtTime(1e-4, start);
	amp.gain.exponentialRampToValueAtTime(Math.max(gain, 1e-4), start + .02);
	amp.gain.exponentialRampToValueAtTime(1e-4, start + duration);
	osc.connect(amp);
	amp.connect(dest);
	osc.start(start);
	osc.stop(start + duration + .02);
}
function playPhone(audio, dest, t) {
	[
		659.25,
		783.99,
		659.25,
		987.77,
		783.99,
		659.25
	].forEach((freq, index) => {
		tone(audio, dest, freq, t + index * .16, .22, .22);
		tone(audio, dest, freq / 2, t + index * .16, .22, .05);
	});
}
function playBell(audio, dest, t) {
	tone(audio, dest, 880, t, .7, .24);
	tone(audio, dest, 1320, t, .4, .08);
	tone(audio, dest, 660, t + .45, .8, .16);
}
function playSiren(audio, dest, t) {
	const osc = audio.createOscillator();
	const amp = audio.createGain();
	osc.type = "triangle";
	osc.frequency.setValueAtTime(440, t);
	osc.frequency.linearRampToValueAtTime(880, t + .35);
	osc.frequency.linearRampToValueAtTime(440, t + .7);
	osc.frequency.linearRampToValueAtTime(880, t + 1.02);
	amp.gain.setValueAtTime(1e-4, t);
	amp.gain.exponentialRampToValueAtTime(.22, t + .04);
	amp.gain.exponentialRampToValueAtTime(1e-4, t + 1.05);
	osc.connect(amp);
	amp.connect(dest);
	osc.start(t);
	osc.stop(t + 1.08);
}
function startRingtone(kind, volume) {
	activeStop?.();
	const audio = context();
	const gain = audio.createGain();
	gain.gain.value = clampVolume(volume);
	gain.connect(audio.destination);
	master = gain;
	let stopped = false;
	let timer = 0;
	const loop = () => {
		if (stopped) return;
		const t = audio.currentTime + .03;
		if (kind === "phone") playPhone(audio, gain, t);
		else if (kind === "bell") playBell(audio, gain, t);
		else playSiren(audio, gain, t);
		const wait = kind === "siren" ? 1200 : kind === "bell" ? 1700 : 1500;
		timer = window.setTimeout(loop, wait);
	};
	const stop = () => {
		if (stopped) return;
		stopped = true;
		window.clearTimeout(timer);
		const now = audio.currentTime;
		gain.gain.cancelScheduledValues(now);
		gain.gain.setTargetAtTime(1e-4, now, .03);
		window.setTimeout(() => {
			gain.disconnect();
			if (master === gain) master = null;
		}, 180);
		if (activeStop === stop) activeStop = null;
	};
	activeStop = stop;
	loop();
	return stop;
}
var customAudio = null;
/**
* Loop a user-imported sound (data URL from an <input type="file">).
* Returns a stop function with the same contract as startRingtone.
*/
function startCustomRingtone(dataUrl, volume) {
	activeStop?.();
	const audio = new Audio(dataUrl);
	audio.loop = true;
	audio.volume = clampVolume(volume);
	customAudio = audio;
	audio.play().catch(() => {});
	let stopped = false;
	const stop = () => {
		if (stopped) return;
		stopped = true;
		audio.pause();
		audio.removeAttribute("src");
		if (customAudio === audio) customAudio = null;
		if (activeStop === stop) activeStop = null;
	};
	activeStop = stop;
	return stop;
}
function setRingVolume(volume) {
	if (customAudio) customAudio.volume = clampVolume(volume);
	if (!master || !ctx) return;
	master.gain.setTargetAtTime(clampVolume(volume), ctx.currentTime, .02);
}
function stopRingtone() {
	activeStop?.();
}
async function holdAwake(on) {
	if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
	try {
		if (on) {
			if (wakeLock && !wakeLock.released) return;
			wakeLock = await navigator.wakeLock.request("screen");
			return;
		}
		await wakeLock?.release();
		wakeLock = null;
	} catch {
		wakeLock = null;
	}
}
var STORAGE_KEY = "linebell.v1";
function loadSaved() {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const data = JSON.parse(raw);
		return {
			alerts: Array.isArray(data.alerts) ? data.alerts.flatMap((value) => {
				if (!value || typeof value !== "object") return [];
				const alert = value;
				const migratedSymbol = migrateSymbol(alert.symbol);
				if (!migratedSymbol) return [];
				const migrated = {
					...alert,
					symbol: migratedSymbol
				};
				return isAlert(migrated) ? [normalizeAlert(migrated)] : [];
			}) : [],
			symbol: data.symbol && isSymbol(data.symbol) ? data.symbol : migrateSymbol(data.symbol) ?? "BTCUSD",
			interval: data.interval && isInterval(data.interval) ? data.interval : "1m",
			condition: data.condition === "touch" || data.condition === "cross-up" || data.condition === "cross-down" ? data.condition : "touch",
			tone: data.tone === "phone" || data.tone === "bell" || data.tone === "siren" ? data.tone : "phone",
			repeat: data.repeat !== false,
			volume: typeof data.volume === "number" ? data.volume : .8,
			customTone: data.customTone && typeof data.customTone === "object" && typeof data.customTone.url === "string" ? {
				url: data.customTone.url,
				name: typeof data.customTone.name === "string" ? data.customTone.name : "Custom sound"
			} : null
		};
	} catch {
		return null;
	}
}
function snap(tick) {
	return {
		high: tick.high,
		low: tick.low,
		close: tick.close
	};
}
function LinebellApp() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Desk, {});
}
function Desk() {
	const [symbol, setSymbol] = (0, import_react.useState)("BTCUSD");
	const [interval, setInterval] = (0, import_react.useState)("1m");
	const [condition, setCondition] = (0, import_react.useState)("touch");
	const [tone, setTone] = (0, import_react.useState)("phone");
	const [repeat, setRepeat] = (0, import_react.useState)(true);
	const [volume, setVolume] = (0, import_react.useState)(.8);
	const [customTone, setCustomTone] = (0, import_react.useState)(null);
	const [toneNote, setToneNote] = (0, import_react.useState)(null);
	const [alerts, setAlerts] = (0, import_react.useState)([]);
	const [selectedId, setSelectedId] = (0, import_react.useState)(null);
	const [priceText, setPriceText] = (0, import_react.useState)("");
	const [quote, setQuote] = (0, import_react.useState)(null);
	const [status, setStatus] = (0, import_react.useState)("connecting");
	const [ringingId, setRingingId] = (0, import_react.useState)(null);
	const [soundOn, setSoundOn] = (0, import_react.useState)(false);
	const [testing, setTesting] = (0, import_react.useState)(false);
	const [ready, setReady] = (0, import_react.useState)(false);
	const alertsRef = (0, import_react.useRef)(alerts);
	const ringingRef = (0, import_react.useRef)(null);
	const prevRef = (0, import_react.useRef)(null);
	const quoteRef = (0, import_react.useRef)(null);
	const volumeRef = (0, import_react.useRef)(volume);
	const toneRef = (0, import_react.useRef)(tone);
	const customToneRef = (0, import_react.useRef)(customTone);
	const testStop = (0, import_react.useRef)(null);
	alertsRef.current = alerts;
	volumeRef.current = volume;
	toneRef.current = tone;
	customToneRef.current = customTone;
	quoteRef.current = quote;
	const market = marketBySymbol(symbol);
	const parsed = parsePrice(priceText, symbol);
	const ringing = alerts.find((alert) => alert.id === ringingId) ?? null;
	const armedHere = alerts.some((alert) => alert.armed && alert.symbol === symbol);
	(0, import_react.useEffect)(() => {
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
	(0, import_react.useEffect)(() => {
		if (!ready) return;
		const payload = {
			alerts,
			symbol,
			interval,
			condition,
			tone,
			repeat,
			volume,
			customTone
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
	}, [
		ready,
		alerts,
		symbol,
		interval,
		condition,
		tone,
		repeat,
		volume,
		customTone
	]);
	(0, import_react.useEffect)(() => {
		holdAwake(alerts.some((alert) => alert.armed));
	}, [alerts]);
	(0, import_react.useEffect)(() => {
		const onVisible = () => {
			if (document.visibilityState === "visible" && alertsRef.current.some((alert) => alert.armed)) holdAwake(true);
		};
		document.addEventListener("visibilitychange", onVisible);
		return () => {
			document.removeEventListener("visibilitychange", onVisible);
			holdAwake(false);
			stopRingtone();
		};
	}, []);
	(0, import_react.useEffect)(() => {
		if (!ringing) return;
		const previous = document.title;
		document.title = `RING · ${marketBySymbol(ringing.symbol).short}`;
		return () => {
			document.title = previous;
		};
	}, [ringing]);
	const chartLines = (0, import_react.useMemo)(() => alerts.filter((alert) => alert.symbol === symbol).map((alert) => ({
		id: alert.id,
		price: alert.price,
		selected: alert.id === selectedId,
		hot: alert.id === ringingId,
		armed: alert.armed
	})), [
		alerts,
		symbol,
		selectedId,
		ringingId
	]);
	async function enableSound() {
		const ok = await unlockAudio();
		setSoundOn(ok);
		if (alertsRef.current.some((alert) => alert.armed)) holdAwake(true);
		return ok;
	}
	function baseline() {
		if (quoteRef.current && quoteRef.current.symbol === symbol) prevRef.current = snap(quoteRef.current);
	}
	function beginRing(alert) {
		ringingRef.current = alert.id;
		setRingingId(alert.id);
		stopRingtone();
		testStop.current?.();
		testStop.current = null;
		setTesting(false);
		try {
			if (customToneRef.current) startCustomRingtone(customToneRef.current.url, volumeRef.current);
			else startRingtone(alert.tone, volumeRef.current);
		} catch {}
		if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate([
			200,
			80,
			200,
			80,
			400
		]);
		if (typeof Notification !== "undefined" && Notification.permission === "granted") try {
			new Notification("Linebell", { body: `${marketBySymbol(alert.symbol).name} ${hitPhrase(alert.condition)} at ${formatPrice(alert.price, alert.symbol)}` });
		} catch {}
	}
	function stopRing() {
		stopRingtone();
		ringingRef.current = null;
		setRingingId(null);
		if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(0);
	}
	function onTick(tick) {
		setQuote((current) => ({
			...tick,
			change: tick.change ?? (current?.symbol === tick.symbol ? current.change : null)
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
		let hit = null;
		const next = alertsRef.current.map((alert) => {
			if (alert.symbol !== tick.symbol || !alert.armed) return alert;
			if (alert.latch) {
				if (!zoneHot(alert.condition, alert.price, tick)) {
					changed = true;
					return {
						...alert,
						latch: false
					};
				}
				return alert;
			}
			if (!hit && shouldFire(alert.condition, alert.price, prev, tick)) {
				hit = alert;
				changed = true;
				return {
					...alert,
					armed: alert.repeat,
					latch: true
				};
			}
			return alert;
		});
		if (changed) {
			alertsRef.current = next;
			setAlerts(next);
		}
		if (hit) beginRing(hit);
	}
	function chooseMarket(next) {
		setSymbol(next);
		setSelectedId(null);
		setPriceText("");
		prevRef.current = null;
		setQuote(null);
	}
	function chooseAlert(alert) {
		setSelectedId(alert.id);
		setSymbol(alert.symbol);
		setPriceText(String(alert.price));
		setCondition(alert.condition);
		setTone(alert.tone);
		setRepeat(alert.repeat);
		prevRef.current = null;
	}
	function onPick(price) {
		const rounded = roundPrice(price, symbol);
		setPriceText(String(rounded));
		if (!selectedId) return;
		baseline();
		setAlerts((list) => list.map((alert) => alert.id === selectedId ? {
			...alert,
			price: rounded,
			latch: false
		} : alert));
	}
	async function armLine() {
		const price = parsePrice(priceText, symbol);
		if (price == null) return;
		await enableSound();
		if (typeof Notification !== "undefined" && Notification.permission === "default") Notification.requestPermission();
		baseline();
		const id = (selectedId ? alerts.find((alert) => alert.id === selectedId) : void 0)?.id ?? crypto.randomUUID();
		const nextAlert = {
			id,
			symbol,
			price,
			condition,
			tone,
			armed: true,
			repeat,
			latch: false
		};
		setAlerts((list) => {
			if (list.some((alert) => alert.id === id)) return list.map((alert) => alert.id === id ? nextAlert : alert);
			return [nextAlert, ...list].slice(0, 24);
		});
		setSelectedId(id);
	}
	async function toggleArmed(alert) {
		const armed = !alert.armed;
		if (armed) {
			await enableSound();
			baseline();
			if (typeof Notification !== "undefined" && Notification.permission === "default") Notification.requestPermission();
		}
		setAlerts((list) => list.map((item) => item.id === alert.id ? {
			...item,
			armed,
			latch: false
		} : item));
	}
	function removeAlert(id) {
		if (ringingRef.current === id) stopRing();
		setAlerts((list) => list.filter((alert) => alert.id !== id));
		if (selectedId === id) setSelectedId(null);
	}
	function pickCustomTone(file) {
		if (!file) return;
		if (!file.type.startsWith("audio/")) {
			setToneNote("Please choose an audio file (MP3, WAV, OGG…).");
			return;
		}
		if (file.size > 2097152) {
			setToneNote("Please choose a file under 2 MB so it can be stored in the browser.");
			return;
		}
		const reader = new FileReader();
		reader.onload = () => {
			if (typeof reader.result === "string") {
				setCustomTone({
					url: reader.result,
					name: file.name
				});
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
		if (!await enableSound() || ringingRef.current) return;
		stopRingtone();
		testStop.current?.();
		const stop = customToneRef.current ? startCustomRingtone(customToneRef.current.url, volumeRef.current) : startRingtone(toneRef.current, volumeRef.current);
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
	const distance = quote && parsed ? quote.price - parsed : quote && selectedId ? quote.price - (alerts.find((alert) => alert.id === selectedId)?.price ?? quote.price) : null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-start lg:py-6",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "flex min-w-0 flex-1 flex-col gap-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
						className: "flex flex-col gap-3",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-center justify-between gap-3",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center gap-2",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "grid h-11 w-11 place-items-center rounded-xl bg-copper text-copper-ink",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Bell, {
											className: "size-5",
											"aria-hidden": "true"
										})
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "text-sm font-semibold tracking-widest text-copper",
										children: "LINEBELL"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
										className: "text-xl font-semibold text-paper",
										children: "Set a line. It rings."
									})] })]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "flex items-center gap-2 text-sm text-fog",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: `inline-block size-2 rounded-full ${status === "live" ? "live-dot bg-mint" : status === "offline" ? "bg-heat" : "bg-fog"}`,
										"aria-hidden": "true"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: status === "live" ? "Live" : status === "offline" ? "Offline" : status === "closed" ? "Closed" : "Connecting" })]
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex flex-col gap-2",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "flex gap-2 overflow-x-auto pb-1",
										children: MARKETS.filter((item) => item.venue === "coinbase").map((item) => {
											const active = item.symbol === symbol;
											return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
												type: "button",
												"aria-pressed": active,
												onClick: () => chooseMarket(item.symbol),
												className: `h-11 shrink-0 rounded-full px-4 font-medium ${active ? "bg-paper text-ink" : "bg-raised text-fog"}`,
												children: item.short
											}, item.symbol);
										})
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "text-sm text-fog",
										children: "Forex and gold"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "flex gap-2 overflow-x-auto pb-1",
										children: MARKETS.filter((item) => item.venue === "yahoo").map((item) => {
											const active = item.symbol === symbol;
											return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
												type: "button",
												"aria-pressed": active,
												onClick: () => chooseMarket(item.symbol),
												className: `h-11 shrink-0 rounded-full px-4 font-medium ${active ? "bg-paper text-ink" : "bg-raised text-fog"}`,
												children: item.short
											}, item.symbol);
										})
									})
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex flex-wrap items-end justify-between gap-3",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "min-w-0",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
										className: "text-sm text-fog",
										children: [
											market.name,
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "text-line",
												children: " · "
											}),
											market.short
										]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "font-mono text-4xl font-medium tracking-tight text-paper sm:text-5xl",
										children: quote ? formatPrice(quote.price, symbol) : "—"
									})]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: `font-mono text-lg ${up ? "text-mint" : "text-heat"}`,
									children: quote?.change == null ? "" : `${up ? "+" : ""}${quote.change.toFixed(2)}%`
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "flex gap-2",
								children: INTERVALS.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									"aria-pressed": item === interval,
									onClick: () => {
										setInterval(item);
										prevRef.current = null;
									},
									className: `h-11 rounded-xl px-4 font-mono ${item === interval ? "bg-raised text-paper" : "text-fog"}`,
									children: item
								}, item))
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MarketChart, {
						symbol,
						interval,
						lines: chartLines,
						onTick,
						onPick,
						onStatus: setStatus
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "text-sm text-fog",
						children: [
							"Tap the chart to drop a horizontal price line. Green candles are up, red candles are down.",
							market.symbol === "XAUUSD" ? " Gold is the futures price." : "",
							status === "closed" ? " This market is closed. The ring waits until price moves again." : ""
						]
					}),
					distance != null && quote ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "font-mono text-sm text-fog",
						"aria-live": "polite",
						children: Math.abs(distance) < quote.price * 5e-5 ? "Price is on your line" : `${formatPrice(Math.abs(distance), symbol)} ${distance > 0 ? "above" : "below"} your line`
					}) : null
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
				className: "flex w-full flex-col gap-4 rounded-2xl border border-line bg-panel p-4 lg:w-96",
				children: [
					armedHere && !soundOn ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => void enableSound(),
						className: "h-12 rounded-xl bg-copper px-4 text-left font-semibold text-copper-ink",
						children: "Tap once so the ringtone can play"
					}) : null,
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-col gap-2",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
								htmlFor: "line-price",
								className: "text-sm text-fog",
								children: "Price line"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								id: "line-price",
								inputMode: "decimal",
								value: priceText,
								placeholder: quote ? formatPrice(quote.price, symbol) : "Type a price",
								onChange: (event) => setPriceText(event.target.value),
								className: "h-12 rounded-xl border border-line bg-ink px-3 font-mono text-paper outline-none placeholder:text-fog focus:border-copper"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex flex-wrap gap-1",
								children: [quote ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: () => onPick(quote.price),
									className: "h-11 px-1 text-sm text-copper",
									children: "Use the live price"
								}) : null, selectedId ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: () => {
										setSelectedId(null);
										setPriceText("");
									},
									className: "h-11 px-1 text-sm text-copper",
									children: "New line instead"
								}) : null]
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "flex flex-col gap-2 text-sm text-fog",
						children: ["Ring when price", /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
							value: condition,
							onChange: (event) => setCondition(event.target.value),
							className: "h-12 rounded-xl border border-line bg-ink px-3 text-paper outline-none focus:border-copper",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: "touch",
									children: "Touches the line"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: "cross-up",
									children: "Crosses above"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: "cross-down",
									children: "Crosses below"
								})
							]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "flex flex-col gap-2 text-sm text-fog",
						children: ["Sound", /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
							value: tone,
							onChange: (event) => setTone(event.target.value),
							className: "h-12 rounded-xl border border-line bg-ink px-3 text-paper outline-none focus:border-copper",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: "phone",
									children: "Ringtone"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: "bell",
									children: "Bell"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: "siren",
									children: "Siren"
								})
							]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-col gap-2 text-sm text-fog",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Custom sound (replaces the tone above)" }),
							customTone ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex h-12 items-center justify-between gap-2 rounded-xl border border-line bg-ink px-3",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "truncate text-paper",
									children: customTone.name
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: clearCustomTone,
									className: "shrink-0 text-copper hover:underline",
									children: "Remove"
								})]
							}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								type: "file",
								accept: "audio/*",
								onChange: (event) => {
									pickCustomTone(event.target.files?.[0]);
									event.target.value = "";
								},
								className: "h-12 rounded-xl border border-line bg-ink px-3 py-3 text-paper file:mr-3 file:rounded-lg file:border-0 file:bg-copper file:px-3 file:py-1 file:text-ink"
							}),
							toneNote ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-xs text-copper",
								children: toneNote
							}) : null
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						role: "switch",
						"aria-checked": repeat,
						onClick: () => setRepeat((value) => !value),
						className: "flex h-12 items-center justify-between rounded-xl border border-line bg-ink px-3 text-left",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Ring again on the next hit" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: repeat ? "font-semibold text-mint" : "text-fog",
							children: repeat ? "On" : "Off"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "flex flex-col gap-2 text-sm text-fog",
						children: ["Volume", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							type: "range",
							min: .2,
							max: 1,
							step: .05,
							value: volume,
							"aria-label": "Volume",
							onChange: (event) => {
								const next = Number(event.target.value);
								setVolume(next);
								setRingVolume(next);
							},
							className: "h-11 accent-copper"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						disabled: parsed == null,
						onClick: () => void armLine(),
						className: "h-12 rounded-xl bg-copper font-semibold text-copper-ink disabled:opacity-40",
						children: selectedId ? "Update and arm" : "Arm this line"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => void testRing(),
						disabled: testing || ringingId != null,
						className: "h-12 rounded-xl border border-line bg-raised font-medium text-paper disabled:opacity-40",
						children: testing ? "Playing…" : "Test the ringtone"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-col gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h2", {
							className: "text-sm text-fog",
							children: ["Lines on ", market.short]
						}), mine.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "rounded-xl border border-dashed border-line px-3 py-4 text-sm text-fog",
							children: "No line yet. Type a price or tap the chart, then arm it."
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
							className: "flex flex-col gap-2",
							children: mine.map((alert) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
								className: `flex flex-col gap-2 rounded-xl border bg-ink p-3 ${alert.id === selectedId ? "border-copper" : "border-line"}`,
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-start justify-between gap-3",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
										type: "button",
										onClick: () => chooseAlert(alert),
										className: "min-w-0 text-left",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "block font-mono text-lg text-paper",
											children: formatPrice(alert.price, alert.symbol)
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
											className: "block text-sm text-fog",
											children: [
												conditionLabel(alert.condition),
												" · ",
												toneLabel(alert.tone)
											]
										})]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										"aria-label": `Remove ${formatPrice(alert.price, alert.symbol)}`,
										onClick: () => removeAlert(alert.id),
										className: "grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line text-fog",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, {
											className: "size-4",
											"aria-hidden": "true"
										})
									})]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									"aria-pressed": alert.armed,
									onClick: () => void toggleArmed(alert),
									className: `h-11 rounded-xl font-medium ${alert.armed ? "bg-mint text-mint-ink" : "bg-raised text-paper"}`,
									children: alert.armed ? "Armed — watching" : "Arm"
								})]
							}, alert.id))
						})]
					}),
					others.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-col gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "text-sm text-fog",
							children: "Paused on other markets"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
							className: "flex flex-col gap-2",
							children: others.map((alert) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
								className: "flex items-center justify-between gap-3",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "min-w-0 text-sm text-fog",
									children: [
										marketBySymbol(alert.symbol).short,
										" · ",
										formatPrice(alert.price, alert.symbol)
									]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: () => chooseAlert(alert),
									className: "h-11 shrink-0 rounded-xl border border-line px-3 text-paper",
									children: "Watch"
								})]
							}, alert.id))
						})]
					}) : null,
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "text-sm text-fog",
						children: ["Free in this browser. Leave the page open. Linebell plays a ringtone on this device — it can’t dial your phone or open the ringtone saved on it.", armedHere ? " The screen stays awake while a line here is armed." : ""]
					})
				]
			}),
			ringing ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				role: "alertdialog",
				"aria-modal": "true",
				"aria-labelledby": "ring-title",
				className: "alarm-frame fixed inset-0 z-40 flex items-center justify-center bg-ink px-6",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex w-full max-w-md flex-col items-center gap-4 text-center",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "grid h-16 w-16 place-items-center rounded-full bg-heat text-heat-ink",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BellRing, {
								className: "size-8",
								"aria-hidden": "true"
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-sm font-semibold tracking-widest text-heat",
								children: "LINE HIT"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h2", {
								id: "ring-title",
								className: "mt-1 text-3xl font-semibold text-paper",
								children: [
									marketBySymbol(ringing.symbol).name,
									" ",
									hitPhrase(ringing.condition)
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-2 font-mono text-2xl text-copper",
								children: formatPrice(ringing.price, ringing.symbol)
							})
						] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: stopRing,
							className: "h-14 w-full rounded-xl bg-heat text-lg font-semibold text-heat-ink",
							children: "Stop the ring"
						})
					]
				})
			}) : null
		]
	});
}
var SplitComponent = LinebellApp;
//#endregion
export { SplitComponent as component };
