import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RULES, breakHours, netHours, restHoursBetween, weekStart, dateRange, fmt, hm } from "../src/time.ts";

test("net hours deduct the legal break", () => {
  assert.equal(netHours("11:00", "15:30", DEFAULT_RULES), 4.5);          // under 6 hours: no break
  assert.equal(netHours("14:00", "22:00", DEFAULT_RULES), 7.5);          // over 6 hours: 30 minutes
  assert.equal(netHours("11:00", "19:00", DEFAULT_RULES), 7.5);
  assert.equal(netHours("11:00", "22:00", DEFAULT_RULES), 10);           // 11 hours presence: 1 hour, worked time stays at the 10 hour maximum
  assert.equal(breakHours("11:00", "22:00", DEFAULT_RULES), 1);
  assert.equal(breakHours("12:00", "18:00", DEFAULT_RULES), 0);
});

test("rest between shifts counts across midnight", () => {
  assert.equal(restHoursBetween("2026-11-02", "22:00", "2026-11-03", "11:00"), 13);
  assert.equal(restHoursBetween("2026-11-02", "22:00", "2026-11-03", "08:00"), 10);
  assert.equal(restHoursBetween("2026-11-06", "22:00", "2026-11-09", "11:00"), 61);
});

test("weeks start on Monday and ranges are inclusive", () => {
  assert.equal(weekStart("2026-11-05"), "2026-11-02");
  assert.equal(weekStart("2026-11-01"), "2026-10-26");   // a Sunday belongs to the week before
  assert.deepEqual(dateRange("2026-11-28", "2026-11-30"), ["2026-11-28", "2026-11-29", "2026-11-30"]);
});

test("time formatting round trips", () => {
  assert.equal(hm("10:30"), 10.5);
  assert.equal(fmt(10.5), "10:30");
  assert.equal(fmt(hm("09:05")), "09:05");
});
