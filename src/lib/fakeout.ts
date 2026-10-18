import type { MarketSymbol } from "./markets.ts";

export const FAKEOUT_MAX_HISTORY = 50;
export const FAKEOUT_MAX_MONITORS = 8;

export type FakeoutDirection = "up" | "down";
export type FakeoutStatus = "waiting" | "confirmed" | "triggered";

export type FakeoutMonitor = {
  id: string;
  symbol: MarketSymbol;
  level: number;
  direction: FakeoutDirection;
  confirmDistance: number;
  returnDistance: number;
  status: FakeoutStatus;
  paused: boolean;
  breakoutPrice: number | null;
  breakoutTime: number | null;
  returnPrice: number | null;
  triggerTime: number | null;
};

export type FakeoutEvent = {
  id: string;
  monitorId: string;
  symbol: MarketSymbol;
  level: number;
  direction: FakeoutDirection;
  breakoutPrice: number;
  returnPrice: number;
  time: number;
};

export function validateFakeoutInput(input: {
  level: number;
  confirmDistance: number | null;
  returnDistance: number | null;
}): string | null {
  if (!Number.isFinite(input.level) || input.level <= 0) {
    return "The key price level must be a positive number.";
  }
  if (
    input.confirmDistance == null ||
    !Number.isFinite(input.confirmDistance) ||
    input.confirmDistance <= 0
  ) {
    return "The confirmation distance must be a positive number.";
  }
  if (
    input.returnDistance == null ||
    !Number.isFinite(input.returnDistance) ||
    input.returnDistance <= 0
  ) {
    return "The return distance must be a positive number.";
  }
  return null;
}

export function fakeoutIsActive(monitor: FakeoutMonitor): boolean {
  return (
    !monitor.paused &&
    (monitor.status === "waiting" || monitor.status === "confirmed")
  );
}

export function fakeoutDirectionLabel(direction: FakeoutDirection): string {
  return direction === "up" ? "Breakout above" : "Breakout below";
}

export function fakeoutStatusLabel(status: FakeoutStatus): string {
  if (status === "confirmed") return "Breakout Confirmed";
  if (status === "triggered") return "Possible Fakeout Detected";
  return "Waiting for Breakout";
}

export function fakeoutMessage(monitor: FakeoutMonitor): string {
  return monitor.direction === "up"
    ? "Possible upside fakeout — price snapped back below your level."
    : "Possible downside fakeout — price snapped back above your level.";
}

export function rearmFakeout(monitor: FakeoutMonitor): FakeoutMonitor {
  return {
    ...monitor,
    status: "waiting",
    paused: false,
    breakoutPrice: null,
    breakoutTime: null,
    returnPrice: null,
    triggerTime: null,
  };
}

export function stepFakeout(
  monitor: FakeoutMonitor,
  price: number,
  now = Date.now(),
): { monitor: FakeoutMonitor; fired: boolean } {
  if (!fakeoutIsActive(monitor) || !Number.isFinite(price) || price <= 0) {
    return { monitor, fired: false };
  }

  if (monitor.status === "waiting") {
    const confirmed =
      monitor.direction === "up"
        ? price >= monitor.level + monitor.confirmDistance
        : price <= monitor.level - monitor.confirmDistance;
    if (!confirmed) return { monitor, fired: false };
    return {
      monitor: {
        ...monitor,
        status: "confirmed",
        breakoutPrice: price,
        breakoutTime: now,
      },
      fired: false,
    };
  }

  const triggered =
    monitor.direction === "up"
      ? price <= monitor.level - monitor.returnDistance
      : price >= monitor.level + monitor.returnDistance;
  if (!triggered) return { monitor, fired: false };
  return {
    monitor: {
      ...monitor,
      status: "triggered",
      returnPrice: price,
      triggerTime: now,
    },
    fired: true,
  };
}
