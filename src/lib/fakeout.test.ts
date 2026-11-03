import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fakeoutDirectionLabel,
  fakeoutIsActive,
  fakeoutMessage,
  fakeoutStatusLabel,
  rearmFakeout,
  stepFakeout,
  validateFakeoutInput,
  type FakeoutMonitor,
} from "./fakeout.ts";

function monitor(
  overrides: Partial<FakeoutMonitor> = {},
): FakeoutMonitor {
  return {
    id: "monitor-1",
    symbol: "XAUUSD",
    level: 100,
    direction: "up",
    confirmDistance: 2,
    returnDistance: 1,
    status: "waiting",
    paused: false,
    breakoutPrice: null,
    breakoutTime: null,
    returnPrice: null,
    triggerTime: null,
    ...overrides,
  };
}

test("validates positive level and distances", () => {
  assert.equal(
    validateFakeoutInput({
      level: 100,
      confirmDistance: 2,
      returnDistance: 1,
    }),
    null,
  );
  assert.match(
    validateFakeoutInput({
      level: 0,
      confirmDistance: 2,
      returnDistance: 1,
    }) ?? "",
    /level/i,
  );
  assert.match(
    validateFakeoutInput({
      level: 100,
      confirmDistance: null,
      returnDistance: 1,
    }) ?? "",
    /confirmation/i,
  );
});

test("confirms an upside breakout and fires after the snap-back", () => {
  const start = monitor();
  const confirmed = stepFakeout(start, 102, 10);
  assert.equal(confirmed.fired, false);
  assert.equal(confirmed.monitor.status, "confirmed");
  assert.equal(confirmed.monitor.breakoutPrice, 102);
  assert.equal(confirmed.monitor.breakoutTime, 10);

  const triggered = stepFakeout(confirmed.monitor, 99, 20);
  assert.equal(triggered.fired, true);
  assert.equal(triggered.monitor.status, "triggered");
  assert.equal(triggered.monitor.returnPrice, 99);
  assert.equal(triggered.monitor.triggerTime, 20);
  assert.equal(stepFakeout(triggered.monitor, 98).fired, false);
});

test("confirms a downside breakout and fires after the rebound", () => {
  const start = monitor({ direction: "down" });
  const confirmed = stepFakeout(start, 98, 10);
  assert.equal(confirmed.monitor.status, "confirmed");
  const triggered = stepFakeout(confirmed.monitor, 101, 20);
  assert.equal(triggered.fired, true);
  assert.equal(triggered.monitor.returnPrice, 101);
});

test("does not advance paused monitors or invalid prices", () => {
  const paused = monitor({ paused: true });
  assert.equal(stepFakeout(paused, 105).monitor, paused);
  const waiting = monitor();
  assert.equal(stepFakeout(waiting, Number.NaN).monitor, waiting);
  assert.equal(stepFakeout(waiting, 101).monitor, waiting);
});

test("rearming clears the state and resumes the monitor", () => {
  const triggered = monitor({
    status: "triggered",
    paused: true,
    breakoutPrice: 102,
    breakoutTime: 10,
    returnPrice: 99,
    triggerTime: 20,
  });
  assert.deepEqual(rearmFakeout(triggered), {
    ...triggered,
    status: "waiting",
    paused: false,
    breakoutPrice: null,
    breakoutTime: null,
    returnPrice: null,
    triggerTime: null,
  });
});

test("provides status and direction labels and a direction-specific alert", () => {
  assert.equal(fakeoutDirectionLabel("up"), "Breakout above");
  assert.equal(fakeoutDirectionLabel("down"), "Breakout below");
  assert.equal(fakeoutStatusLabel("waiting"), "Waiting for Breakout");
  assert.equal(fakeoutStatusLabel("confirmed"), "Breakout Confirmed");
  assert.equal(fakeoutStatusLabel("triggered"), "Possible Fakeout Detected");
  assert.match(fakeoutMessage(monitor()), /upside/i);
  assert.match(fakeoutMessage(monitor({ direction: "down" })), /downside/i);
});

test("only non-paused waiting and confirmed monitors are active", () => {
  assert.equal(fakeoutIsActive(monitor()), true);
  assert.equal(fakeoutIsActive(monitor({ status: "confirmed" })), true);
  assert.equal(fakeoutIsActive(monitor({ paused: true })), false);
  assert.equal(fakeoutIsActive(monitor({ status: "triggered" })), false);
});
