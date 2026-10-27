import { test } from "node:test";
import assert from "node:assert/strict";
import type { Employee, Slot } from "../src/types.ts";
import { availability } from "../src/availability.ts";
import { DEFAULT_RULES } from "../src/time.ts";

const friClose: Slot = { date: "2026-11-06", dow: 5, start: "14:00", end: "22:00", kind: "close", hours: 7.5 };
const friOpen: Slot = { date: "2026-11-06", dow: 5, start: "11:00", end: "22:00", kind: "open", hours: 10 };
const monEarly: Slot = { date: "2026-11-02", dow: 1, start: "11:00", end: "15:30", kind: "early", hours: 4.5 };

test("vacation and away days block the whole day", () => {
  const e: Employee = { id: "a", name: "A", vacations: [{ from: "2026-11-02", to: "2026-11-08" }] };
  assert.equal(availability(e, friClose, DEFAULT_RULES).ok, false);
  const f: Employee = { id: "b", name: "B", away: ["2026-11-06"] };
  assert.equal(availability(f, friOpen, DEFAULT_RULES).ok, false);
  assert.equal(availability(f, monEarly, DEFAULT_RULES).ok, true);
});

test("a lecture that overlaps a first shift blocks it, the shop has to open on time", () => {
  const e: Employee = { id: "a", name: "A", lectures: [{ day: "fri", from: "09:00", to: "12:00" }] };
  assert.equal(availability(e, friOpen, DEFAULT_RULES).ok, false);
});

test("a lecture that overlaps the start of a second shift moves the start", () => {
  const e: Employee = { id: "a", name: "A", lectures: [{ day: "fri", from: "09:00", to: "15:00" }] };
  assert.deepEqual(availability(e, friClose, DEFAULT_RULES), { ok: true, start: "15:00" });
});

test("a late start that leaves less than the minimum shift blocks the shift", () => {
  const e: Employee = { id: "a", name: "A", lectures: [{ day: "fri", from: "09:00", to: "19:00" }] };
  assert.equal(availability(e, friClose, DEFAULT_RULES).ok, false);
});

test("a lecture in the middle of a shift blocks it", () => {
  const e: Employee = { id: "a", name: "A", lectures: [{ day: "fri", from: "16:00", to: "18:00" }] };
  assert.equal(availability(e, friClose, DEFAULT_RULES).ok, false);
});

test("lectures outside the semester are ignored, and weekday names are matched loosely", () => {
  const e: Employee = {
    id: "a", name: "A",
    lectures: [{ day: "Friday", from: "09:00", to: "15:00" }],
    lectureWeeks: { from: "2026-10-01", to: "2026-10-31" },
  };
  assert.deepEqual(availability(e, friClose, DEFAULT_RULES), { ok: true, start: "14:00" });
  const inSemester = { ...e, lectureWeeks: { from: "2026-10-01", to: "2027-01-31" } };
  assert.deepEqual(availability(inSemester, friClose, DEFAULT_RULES), { ok: true, start: "15:00" });
});
