import { i as __toESM } from "../_runtime.mjs";
import { W as require_react, _ as createRootRoute, d as HeadContent, g as createFileRoute, h as lazyRouteComponent, m as Outlet, p as createRouter, u as Scripts, v as useRouter, y as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { t as TriangleAlert } from "../_libs/lucide-react.mjs";
import { a as union, i as string, n as number, r as object, t as literal } from "../_libs/zod.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/router-B9R-dVkb.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var __defProp = Object.defineProperty;
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
var FALLBACK_MESSAGE = "An unexpected error occurred. Try reloading the page.";
function errorMessage(error) {
	if (error instanceof Error && error.message) return error.message;
	if (typeof error === "string" && error) return error;
	return FALLBACK_MESSAGE;
}
function AppErrorComponent({ error }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "text-red-500",
				"aria-hidden": "true",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TriangleAlert, {
					className: "size-10",
					strokeWidth: 2
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
				className: "text-lg font-semibold",
				children: "Something went wrong"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "max-w-md text-sm break-words text-zinc-500 dark:text-zinc-400",
				children: errorMessage(error)
			})
		]
	});
}
/**
* Path-based preview hosts serve the dev server under `/{port_id}/` and strip
* that prefix before forwarding, so SSR sees `/` while the browser URL keeps the
* prefix. TanStack Start resets `basepath` on hydration, so a `rewrite` keeps
* client routing and generated links aligned with the public URL.
*/
var PATH_BASED_PREVIEW_HOSTS = /* @__PURE__ */ new Set([
	"preview.grok.genai.mil",
	"preview.grok.mil",
	"preview.grokgsac.com"
]);
var PORT_ID_PREFIX = /^\/hds-[a-z0-9]+-\d+-[a-z0-9]+(?=\/|$)/i;
function previewPathPrefix(hostname, pathname) {
	if (!PATH_BASED_PREVIEW_HOSTS.has(hostname.toLowerCase())) return void 0;
	return PORT_ID_PREFIX.exec(pathname)?.[0];
}
function prefixRewrite(prefix) {
	return {
		input: ({ url }) => {
			if (url.pathname === prefix) url.pathname = "/";
			else if (url.pathname.startsWith(`${prefix}/`)) url.pathname = url.pathname.slice(prefix.length);
			return url;
		},
		output: ({ url }) => {
			url.pathname = `${prefix}${url.pathname}`;
			return url;
		}
	};
}
function previewPathRewrite() {
	if (typeof window === "undefined") return void 0;
	const prefix = previewPathPrefix(window.location.hostname, window.location.pathname);
	return prefix ? prefixRewrite(prefix) : void 0;
}
/**
* App-wide client provider mounted once near the root (in `src/routes/__root.tsx`):
*
*   <AuthProvider><Outlet /></AuthProvider>
*
* Better Auth's React client (`@/lib/auth/client`) needs NO context provider —
* its `useSession()` works standalone — so this is a passthrough today. It's
* kept as the single, stable mount point for any future client-side providers
* (e.g. a toast or theme provider) without churning the root shell.
*/
function AuthProvider({ children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children });
}
var CONNECTOR_TOKEN_READY_EVENT = "grok:connector-token-ready";
function isGrokEmbedderOrigin(origin) {
	try {
		const url = new URL(origin);
		if (url.protocol !== "https:" && url.protocol !== "http:") return false;
		const host = url.hostname.toLowerCase();
		if (host === "grok.com" || host.endsWith(".grok.com")) return true;
		if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return true;
		return false;
	} catch {
		return false;
	}
}
function isSandboxPreviewGuestHost(hostname) {
	const host = hostname.toLowerCase();
	return host === "grok-sandbox.com" || host.endsWith(".grok-sandbox.com");
}
function isRemintPreviewPair(guestHost, parentHost) {
	const guest = guestHost.toLowerCase();
	const parent = parentHost.toLowerCase();
	const i = guest.indexOf(".preview.");
	if (i <= 0) return false;
	const label = guest.slice(0, i);
	const rest = guest.slice(i + 9);
	if (label.includes(".") || !rest.includes(".")) return false;
	return parent === rest || parent === `grok.${rest}`;
}
function resolveParentEmbedderOrigin(parentIsSelf, referrer, ancestorOrigin, guestHostname = "") {
	if (parentIsSelf) return null;
	for (const candidate of [referrer, ancestorOrigin ?? ""].filter(Boolean)) try {
		const url = new URL(candidate.includes("://") ? candidate : `https://${candidate}`);
		if (url.protocol !== "https:" && url.protocol !== "http:") continue;
		if (isGrokEmbedderOrigin(url.origin)) return url.origin;
		if (isSandboxPreviewGuestHost(guestHostname) || isRemintPreviewPair(guestHostname, url.hostname)) return url.origin;
	} catch {}
	return null;
}
/**
* Guest side of the grok-web ↔ sandbox preview postMessage bridge.
*
* Activates only when this page is framed by an allowlisted Grok embedder.
* Top-level runs (download/export, local `npm run dev`, deployed sites) noop.
*/
var PREVIEW_BRIDGE_CHANNEL = "grok-preview-bridge";
var EnvelopeSchema = object({
	channel: literal(PREVIEW_BRIDGE_CHANNEL),
	version: number().int().positive(),
	type: string().min(1)
});
var HelloSchema = EnvelopeSchema.extend({ type: literal("hello") });
var NavigateSchema = EnvelopeSchema.extend({
	type: literal("navigate"),
	path: string().min(1)
});
var HistorySchema = EnvelopeSchema.extend({
	type: literal("history"),
	delta: union([literal(-1), literal(1)])
});
var ConnectorTokenReadySchema = EnvelopeSchema.extend({ type: literal("connector-token-ready") });
function isSafeBridgePath(path) {
	if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return false;
	try {
		return new URL(path, "https://preview.invalid").origin === "https://preview.invalid";
	} catch {
		return false;
	}
}
/**
* Origin of the Grok embedder framing this page, or null when the page runs
* top-level (download/export, local `npm run dev`, deployed sites) or under a
* non-Grok parent. Client-only; null during SSR.
*/
function resolveCurrentEmbedderOrigin() {
	if (typeof window === "undefined") return null;
	const ancestorOrigin = typeof location.ancestorOrigins !== "undefined" && location.ancestorOrigins.length > 0 ? location.ancestorOrigins[0] : null;
	return resolveParentEmbedderOrigin(window.parent === window, document.referrer, ancestorOrigin, window.location.hostname);
}
/**
* Install host↔guest messaging. Returns a dispose function.
* Noops (returns a no-op dispose) when not embedded under a Grok parent.
*/
function installPreviewHostBridge(options = {}) {
	const parentOrigin = resolveCurrentEmbedderOrigin();
	if (parentOrigin === null) return () => {};
	const ROOT_STATE_KEY = "__grokPreviewBridgeRoot";
	const originalPushState = window.history.pushState.bind(window.history);
	const originalReplaceState = window.history.replaceState.bind(window.history);
	const isAtHistoryRoot = () => {
		const state = window.history.state;
		return Boolean(state && typeof state === "object" && state[ROOT_STATE_KEY] === true);
	};
	try {
		const current = window.history.state;
		if (!(current !== null && typeof current === "object" && Object.prototype.hasOwnProperty.call(current, ROOT_STATE_KEY))) {
			const isRoot = window.history.length <= 1;
			originalReplaceState(current && typeof current === "object" ? {
				...current,
				[ROOT_STATE_KEY]: isRoot
			} : { [ROOT_STATE_KEY]: isRoot }, "", window.location.href);
		}
	} catch {}
	const post = (message) => {
		window.parent.postMessage(message, parentOrigin);
	};
	const reportLocation = () => {
		post({
			channel: PREVIEW_BRIDGE_CHANNEL,
			version: 1,
			type: "location",
			path: window.location.pathname || "/",
			search: window.location.search,
			hash: window.location.hash
		});
	};
	const reportRoutes = () => {
		const paths = options.getRoutePaths?.() ?? [];
		post({
			channel: PREVIEW_BRIDGE_CHANNEL,
			version: 1,
			type: "routes",
			paths
		});
	};
	const defaultNavigate = (path) => {
		if (!isSafeBridgePath(path)) return;
		try {
			const url = new URL(path, window.location.origin);
			if (url.origin !== window.location.origin) return;
			const next = `${url.pathname}${url.search}${url.hash}`;
			window.history.pushState(window.history.state, "", next);
			window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
		} catch {}
	};
	const navigate = (path) => {
		if (!isSafeBridgePath(path)) return;
		if (options.navigate) {
			options.navigate(path);
			return;
		}
		defaultNavigate(path);
	};
	const announce = () => {
		reportLocation();
		reportRoutes();
		post({
			channel: PREVIEW_BRIDGE_CHANNEL,
			version: 1,
			type: "ready"
		});
	};
	const onHello = (data) => {
		if (!HelloSchema.safeParse(data).success) return;
		announce();
	};
	const onNavigate = (data) => {
		const parsed = NavigateSchema.safeParse(data);
		if (!parsed.success) return;
		navigate(parsed.data.path);
		queueMicrotask(reportLocation);
	};
	const onHistory = (data) => {
		const parsed = HistorySchema.safeParse(data);
		if (!parsed.success) return;
		if (parsed.data.delta === -1 && isAtHistoryRoot()) return;
		window.history.go(parsed.data.delta);
	};
	const onConnectorTokenReady = (data) => {
		if (!ConnectorTokenReadySchema.safeParse(data).success) return;
		window.dispatchEvent(new Event(CONNECTOR_TOKEN_READY_EVENT));
	};
	const hostMessageHandlers = /* @__PURE__ */ new Map([
		["hello", onHello],
		["navigate", onNavigate],
		["history", onHistory],
		["connector-token-ready", onConnectorTokenReady]
	]);
	const onMessage = (event) => {
		if (event.source !== window.parent) return;
		if (event.origin !== parentOrigin) return;
		const envelope = EnvelopeSchema.safeParse(event.data);
		if (!envelope.success || envelope.data.version !== 1) return;
		hostMessageHandlers.get(envelope.data.type)?.(event.data);
	};
	const onPopState = () => {
		reportLocation();
	};
	const onHashChange = () => {
		reportLocation();
	};
	window.history.pushState = (data, unused, url) => {
		const next = data && typeof data === "object" ? {
			...data,
			[ROOT_STATE_KEY]: false
		} : data;
		originalPushState(next, unused, url);
		reportLocation();
	};
	window.history.replaceState = (data, unused, url) => {
		const next = isAtHistoryRoot() ? {
			...data && typeof data === "object" ? data : {},
			[ROOT_STATE_KEY]: true
		} : data;
		originalReplaceState(next, unused, url);
		reportLocation();
	};
	window.addEventListener("message", onMessage);
	window.addEventListener("popstate", onPopState);
	window.addEventListener("hashchange", onHashChange);
	announce();
	return () => {
		window.removeEventListener("message", onMessage);
		window.removeEventListener("popstate", onPopState);
		window.removeEventListener("hashchange", onHashChange);
		window.history.pushState = originalPushState;
		window.history.replaceState = originalReplaceState;
	};
}
/** Collect static path patterns from a TanStack route tree (best-effort). */
function collectRoutePathsFromTree(routeTree) {
	const paths = /* @__PURE__ */ new Set();
	const walk = (node) => {
		if (!node || typeof node !== "object") return;
		const record = node;
		const full = typeof record.fullPath === "string" ? record.fullPath : typeof record.path === "string" ? record.path : null;
		if (full !== null && full !== "") paths.add(full.startsWith("/") ? full : `/${full}`);
		else if (full === "") paths.add("/");
		const children = record.children;
		if (Array.isArray(children)) for (const child of children) walk(child);
		else if (children && typeof children === "object") for (const child of Object.values(children)) walk(child);
	};
	walk(routeTree);
	return [...paths];
}
/**
* Mount once in `__root.tsx` so the Grok preview chrome can drive navigation
* (and later receive registered routes). Noops when the app is not embedded.
*/
function PreviewHostBridge() {
	const router = useRouter();
	(0, import_react.useEffect)(() => {
		return installPreviewHostBridge({
			navigate: (path) => {
				router.history.push(path);
			},
			getRoutePaths: () => collectRoutePathsFromTree(router.routeTree)
		});
	}, [router]);
	return null;
}
var styles_default = "/assets/styles-Heqknupk.css";
var APP_NAME = "Linebell";
var Route$2 = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1"
			},
			{ title: APP_NAME },
			{
				name: "description",
				content: "Set a price line on a live market. Linebell plays a ringtone when a candle touches or crosses it."
			},
			{
				name: "theme-color",
				content: "#0c1210"
			}
		],
		links: [
			{
				rel: "icon",
				type: "image/svg+xml",
				href: "/favicon.svg"
			},
			{
				rel: "stylesheet",
				href: styles_default
			},
			{
				rel: "manifest",
				href: "/__grok/manifest.webmanifest"
			},
			{
				rel: "apple-touch-icon",
				href: "/__grok/icon-180.png"
			},
			{
				rel: "preconnect",
				href: "https://fonts.googleapis.com"
			},
			{
				rel: "preconnect",
				href: "https://fonts.gstatic.com",
				crossOrigin: "anonymous"
			},
			{
				rel: "stylesheet",
				href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Outfit:wght@400;500;600;700&display=swap"
			}
		]
	}),
	component: () => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("html", {
		lang: "en",
		suppressHydrationWarning: true,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("head", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HeadContent, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("body", { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PreviewHostBridge, {}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AuthProvider, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Outlet, {}) }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Scripts, {})
		] })]
	})
});
var $$splitComponentImporter = () => import("./routes-5zpDKrC3.mjs");
var Route$1 = createFileRoute("/")({ component: lazyRouteComponent($$splitComponentImporter, "component") });
var INTERVALS = [
	"1m",
	"5m",
	"15m",
	"1h"
];
var CRYPTO = [
	{
		symbol: "BTCUSD",
		name: "Bitcoin",
		short: "BTC",
		venue: "coinbase",
		product: "BTC-USD",
		yahoo: "",
		digits: 2
	},
	{
		symbol: "ETHUSD",
		name: "Ether",
		short: "ETH",
		venue: "coinbase",
		product: "ETH-USD",
		yahoo: "",
		digits: 2
	},
	{
		symbol: "SOLUSD",
		name: "Solana",
		short: "SOL",
		venue: "coinbase",
		product: "SOL-USD",
		yahoo: "",
		digits: 2
	},
	{
		symbol: "BNBUSD",
		name: "BNB",
		short: "BNB",
		venue: "coinbase",
		product: "BNB-USD",
		yahoo: "",
		digits: 2
	},
	{
		symbol: "XRPUSD",
		name: "XRP",
		short: "XRP",
		venue: "coinbase",
		product: "XRP-USD",
		yahoo: "",
		digits: 4
	},
	{
		symbol: "DOGEUSD",
		name: "Dogecoin",
		short: "DOGE",
		venue: "coinbase",
		product: "DOGE-USD",
		yahoo: "",
		digits: 5
	},
	{
		symbol: "ADAUSD",
		name: "Cardano",
		short: "ADA",
		venue: "coinbase",
		product: "ADA-USD",
		yahoo: "",
		digits: 4
	},
	{
		symbol: "AVAXUSD",
		name: "Avalanche",
		short: "AVAX",
		venue: "coinbase",
		product: "AVAX-USD",
		yahoo: "",
		digits: 2
	},
	{
		symbol: "LINKUSD",
		name: "Chainlink",
		short: "LINK",
		venue: "coinbase",
		product: "LINK-USD",
		yahoo: "",
		digits: 2
	}
];
var FOREX = [
	{
		symbol: "EURUSD",
		name: "Euro",
		short: "EURUSD",
		venue: "yahoo",
		yahoo: "EURUSD=X",
		digits: 5
	},
	{
		symbol: "GBPUSD",
		name: "Sterling",
		short: "GBPUSD",
		venue: "yahoo",
		yahoo: "GBPUSD=X",
		digits: 5
	},
	{
		symbol: "USDJPY",
		name: "Yen",
		short: "USDJPY",
		venue: "yahoo",
		yahoo: "USDJPY=X",
		digits: 3
	},
	{
		symbol: "USDCHF",
		name: "Swiss franc",
		short: "USDCHF",
		venue: "yahoo",
		yahoo: "USDCHF=X",
		digits: 5
	},
	{
		symbol: "AUDUSD",
		name: "Aussie",
		short: "AUDUSD",
		venue: "yahoo",
		yahoo: "AUDUSD=X",
		digits: 5
	},
	{
		symbol: "USDCAD",
		name: "Canadian",
		short: "USDCAD",
		venue: "yahoo",
		yahoo: "USDCAD=X",
		digits: 5
	},
	{
		symbol: "NZDUSD",
		name: "NZ dollar",
		short: "NZDUSD",
		venue: "yahoo",
		yahoo: "NZDUSD=X",
		digits: 5
	},
	{
		symbol: "XAUUSD",
		name: "Gold",
		short: "GOLD",
		venue: "yahoo",
		yahoo: "GC=F",
		digits: 2
	}
];
var MARKETS = [...CRYPTO, ...FOREX];
var LEGACY_SYMBOLS = {
	BTCUSDT: "BTCUSD",
	ETHUSDT: "ETHUSD",
	SOLUSDT: "SOLUSD",
	BNBUSDT: "BNBUSD",
	XRPUSDT: "XRPUSD",
	DOGEUSDT: "DOGEUSD",
	ADAUSDT: "ADAUSD",
	AVAXUSDT: "AVAXUSD",
	LINKUSDT: "LINKUSD"
};
var CONDITIONS = [
	"touch",
	"cross-up",
	"cross-down"
];
var TONES = [
	"phone",
	"bell",
	"siren"
];
function isSymbol(value) {
	return MARKETS.some((market) => market.symbol === value);
}
function migrateSymbol(value) {
	if (typeof value !== "string") return null;
	if (isSymbol(value)) return value;
	return LEGACY_SYMBOLS[value] ?? null;
}
function isInterval(value) {
	return INTERVALS.includes(value);
}
function marketBySymbol(symbol) {
	return MARKETS.find((market) => market.symbol === symbol) ?? MARKETS[0];
}
function coinbaseProductId(symbol) {
	const market = MARKETS.find((item) => item.symbol === symbol);
	return market?.venue === "coinbase" ? market.product : null;
}
function isCoinbase(symbol) {
	return marketBySymbol(symbol).venue === "coinbase" && isSymbol(symbol);
}
function digitsFor(value, symbol) {
	if (symbol) {
		const market = MARKETS.find((item) => item.symbol === symbol);
		if (market) return market.digits;
	}
	const abs = Math.abs(value);
	if (abs >= 1e3) return 2;
	if (abs >= 1) return 4;
	return 6;
}
function formatPrice(value, symbol) {
	const digits = digitsFor(value, symbol);
	return value.toLocaleString("en-US", {
		minimumFractionDigits: Math.min(2, digits),
		maximumFractionDigits: digits
	});
}
function roundPrice(value, symbol) {
	const factor = 10 ** digitsFor(value, symbol);
	return Math.round(value * factor) / factor;
}
function parsePrice(text, symbol) {
	const value = Number(text.replace(/,/g, "").trim());
	if (!Number.isFinite(value) || value <= 0) return null;
	return roundPrice(value, symbol);
}
function conditionLabel(condition) {
	if (condition === "touch") return "Touches the line";
	if (condition === "cross-up") return "Crosses above";
	return "Crosses below";
}
function hitPhrase(condition) {
	if (condition === "touch") return "touched your line";
	if (condition === "cross-up") return "crossed above your line";
	return "crossed below your line";
}
function toneLabel(tone) {
	if (tone === "phone") return "Ringtone";
	if (tone === "bell") return "Bell";
	return "Siren";
}
function zoneHot(condition, line, bar) {
	if (condition === "touch") return bar.high >= line && bar.low <= line;
	if (condition === "cross-up") return bar.close >= line;
	return bar.close <= line;
}
function shouldFire(condition, line, prev, next) {
	if (!(line > 0)) return false;
	if (condition === "touch") {
		const was = prev.high >= line && prev.low <= line;
		return next.high >= line && next.low <= line && !was;
	}
	if (condition === "cross-up") return prev.close < line && next.close >= line;
	return prev.close > line && next.close <= line;
}
function isAlert(value) {
	if (!value || typeof value !== "object") return false;
	const alert = value;
	return typeof alert.id === "string" && typeof alert.symbol === "string" && isSymbol(alert.symbol) && typeof alert.price === "number" && alert.price > 0 && typeof alert.condition === "string" && CONDITIONS.includes(alert.condition) && typeof alert.tone === "string" && TONES.includes(alert.tone) && typeof alert.armed === "boolean" && typeof alert.repeat === "boolean";
}
function normalizeAlert(value) {
	return {
		...value,
		latch: value.latch === true
	};
}
var SYMBOLS = new Set(MARKETS.map((market) => market.symbol));
var INTERVAL_SET = new Set(INTERVALS);
var COINBASE = "https://api.exchange.coinbase.com";
var YAHOO_INTERVALS = {
	"1m": "1m",
	"5m": "5m",
	"15m": "15m",
	"1h": "60m"
};
var RANGES = {
	"1m": "1d",
	"5m": "5d",
	"15m": "5d",
	"1h": "1mo"
};
var PERIODS = {
	"1m": 60,
	"5m": 300,
	"15m": 900,
	"1h": 3600
};
async function fetchJson(url) {
	const response = await fetch(url, {
		headers: { "user-agent": "Linebell/1.0" },
		signal: AbortSignal.timeout(8e3)
	});
	if (!response.ok) throw new Error(`upstream returned HTTP ${response.status}`);
	return response.json();
}
function isRecord(value) {
	return value !== null && typeof value === "object";
}
async function coinbaseProductFeed(symbol, interval) {
	const product = coinbaseProductId(symbol);
	if (!product) {
		console.error(`[market] No Coinbase product mapping for ${symbol}`);
		throw new Error(`invalid Coinbase symbol mapping: ${symbol}`);
	}
	const now = Math.floor(Date.now() / 1e3);
	const period = PERIODS[interval];
	const start = (/* @__PURE__ */ new Date((now - period * 180) * 1e3)).toISOString();
	const end = (/* @__PURE__ */ new Date(now * 1e3)).toISOString();
	const productPath = `${COINBASE}/products/${encodeURIComponent(product)}`;
	const [candlePayload, tickerPayload, statsPayload] = await Promise.all([
		fetchJson(`${productPath}/candles?granularity=${period}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`),
		fetchJson(`${productPath}/ticker`),
		fetchJson(`${productPath}/stats`)
	]);
	if (!Array.isArray(candlePayload) || !isRecord(tickerPayload) || !isRecord(statsPayload)) {
		console.error(`[market] Malformed Coinbase response for ${symbol}`, {
			candles: Array.isArray(candlePayload),
			ticker: isRecord(tickerPayload),
			stats: isRecord(statsPayload)
		});
		throw new Error(`malformed Coinbase response for ${symbol}`);
	}
	const byTime = /* @__PURE__ */ new Map();
	for (const row of candlePayload) {
		if (!Array.isArray(row) || row.length < 5) {
			console.warn(`[market] Ignoring malformed Coinbase candle for ${symbol}`, row);
			continue;
		}
		const [timeValue, low, high, open, close] = row.map(Number);
		if (![
			timeValue,
			low,
			high,
			open,
			close
		].every(Number.isFinite) || timeValue <= 0 || low <= 0 || high < low || open <= 0 || close <= 0) {
			console.warn(`[market] Ignoring invalid Coinbase candle for ${symbol}`, row);
			continue;
		}
		byTime.set(Math.floor(timeValue), {
			time: Math.floor(timeValue),
			open,
			high,
			low,
			close
		});
	}
	const candles = [...byTime.values()].sort((left, right) => left.time - right.time);
	const last = candles[candles.length - 1];
	const price = Number(tickerPayload.price);
	const quoteTime = Date.parse(String(tickerPayload.time)) / 1e3;
	const open = Number(statsPayload.open);
	if (!last || !Number.isFinite(price) || price <= 0 || !Number.isFinite(quoteTime)) {
		console.error(`[market] Coinbase returned no usable price/candles for ${symbol}`);
		throw new Error(`empty Coinbase feed for ${symbol}`);
	}
	return {
		candles,
		price,
		quoteTime,
		change: Number.isFinite(open) && open > 0 ? (price - open) / open * 100 : null,
		closed: false
	};
}
async function yahooFeed(symbol, interval) {
	const ticker = marketBySymbol(symbol).yahoo;
	if (!ticker) {
		console.error(`[market] No Yahoo symbol mapping for ${symbol}`);
		throw new Error(`invalid Yahoo symbol mapping: ${symbol}`);
	}
	const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`);
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
	const quote = (indicators && Array.isArray(indicators.quote) ? indicators.quote : [])[0];
	const meta = isRecord(result.meta) ? result.meta : {};
	if (!isRecord(quote)) {
		console.error(`[market] Yahoo returned no candles for ${symbol}`, result);
		throw new Error(`empty Yahoo candles for ${symbol}`);
	}
	const values = {
		open: Array.isArray(quote.open) ? quote.open : [],
		high: Array.isArray(quote.high) ? quote.high : [],
		low: Array.isArray(quote.low) ? quote.low : [],
		close: Array.isArray(quote.close) ? quote.close : []
	};
	const byTime = /* @__PURE__ */ new Map();
	let invalidCandleCount = 0;
	for (let i = 0; i < timestamps.length; i++) {
		const time = Number(timestamps[i]);
		const open = Number(values.open[i]);
		const high = Number(values.high[i]);
		const low = Number(values.low[i]);
		const close = Number(values.close[i]);
		if (![
			time,
			open,
			high,
			low,
			close
		].every(Number.isFinite) || time <= 0 || open <= 0 || high < low || low <= 0 || close <= 0) {
			invalidCandleCount += 1;
			continue;
		}
		byTime.set(Math.floor(time), {
			time: Math.floor(time),
			open,
			high,
			low,
			close
		});
	}
	if (invalidCandleCount > 0) console.warn(`[market] Ignored ${invalidCandleCount} malformed Yahoo candles for ${symbol}`);
	const candles = [...byTime.values()].sort((left, right) => left.time - right.time).slice(-180);
	const last = candles[candles.length - 1];
	if (!last) {
		console.error(`[market] Yahoo returned no valid candles for ${symbol}`);
		throw new Error(`empty Yahoo feed for ${symbol}`);
	}
	const price = Number(meta.regularMarketPrice ?? last.close);
	const previous = Number(meta.chartPreviousClose ?? meta.previousClose);
	const reportedChange = Number(meta.regularMarketChangePercent);
	const change = Number.isFinite(reportedChange) && meta.regularMarketChangePercent != null ? reportedChange : Number.isFinite(previous) && previous > 0 && Number.isFinite(price) ? (price - previous) / previous * 100 : null;
	const lastMarketTime = Number(meta.regularMarketTime ?? last.time);
	const grace = Math.max(PERIODS[interval] * 4, 1200);
	return {
		candles,
		price: Number.isFinite(price) && price > 0 ? price : last.close,
		quoteTime: lastMarketTime,
		change,
		closed: Date.now() / 1e3 - lastMarketTime > grace
	};
}
var Route = createFileRoute("/api/market")({ server: { handlers: { GET: async ({ request }) => {
	const url = new URL(request.url);
	const symbol = (url.searchParams.get("symbol") || "BTCUSD").toUpperCase();
	const interval = url.searchParams.get("interval") || "1m";
	if (!SYMBOLS.has(symbol) || !INTERVAL_SET.has(interval)) {
		console.error(`[market] Rejected invalid request mapping: ${symbol}/${interval}`);
		return Response.json({ error: "Unknown market" }, { status: 400 });
	}
	try {
		const feed = coinbaseProductId(symbol) !== null ? await coinbaseProductFeed(symbol, interval) : await yahooFeed(symbol, interval);
		return Response.json({
			symbol,
			interval,
			...feed
		}, { headers: { "cache-control": "no-store" } });
	} catch (error) {
		console.error(`[market] ${symbol} feed request failed`, error);
		return Response.json({ error: "Market feed unavailable" }, { status: 502 });
	}
} } } });
var rootRouteChildren = {
	IndexRoute: Route$1.update({
		id: "/",
		path: "/",
		getParentRoute: () => Route$2
	}),
	ApiMarketRoute: Route.update({
		id: "/api/market",
		path: "/api/market",
		getParentRoute: () => Route$2
	})
};
var routeTree = Route$2._addFileChildren(rootRouteChildren)._addFileTypes();
var router_exports = /* @__PURE__ */ __exportAll({ getRouter: () => getRouter });
function getRouter() {
	return createRouter({
		routeTree,
		rewrite: previewPathRewrite(),
		defaultErrorComponent: AppErrorComponent
	});
}
//#endregion
export { shouldFire as _, conditionLabel as a, previewPathPrefix as b, isAlert as c, isSymbol as d, marketBySymbol as f, roundPrice as g, parsePrice as h, coinbaseProductId as i, isCoinbase as l, normalizeAlert as m, INTERVALS as n, formatPrice as o, migrateSymbol as p, MARKETS as r, hitPhrase as s, router_exports as t, isInterval as u, toneLabel as v, zoneHot as y };
