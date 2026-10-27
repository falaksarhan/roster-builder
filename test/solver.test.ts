import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Store, Team } from "../src/types.ts";
import { buildRoster, weekSlots } from "../src/solver.ts";
import { availability } from "../src/availability.ts";
import { DEFAULT_RULES, restHoursBetween, weekStart } from "../src/time.ts";
import { renderAll, toJson } from "../src/report.ts";

const store: Store = JSON.parse(readFileSync(new URL("../examples/store.json", import.meta.url), "utf8"));
const team: Team = JSON.parse(readFileSync(new URL("../examples/team.json", import.meta.url), "utf8"));
const opts = { from: "2026-11-02", to: "2026-11-29", seed: 1, restarts: 400 };
const roster = buildRoster(store, team, opts);
const rules = roster.rules;

test("every shift of every open day gets a row, filled or marked open", () => {
  const expected = weekSlots(
    Array.from({ length: 28 }, (_, i) => new Date(Date.UTC(2026, 10, 2 + i)).toISOString().slice(0, 10)), store, rules,
  );
  assert.equal(roster.rows.length, expected.length);
  assert.equal(expected.length, 4 * 12);
});

test("nobody exceeds their weekly cap, and extra hours only for the flexible people", () => {
  for (const w of roster.weeks) {
    for (const e of team.employees) {
      const cap = Math.max(e.weeklyCap ?? rules.contractHoursPerWeek, e.flexibleUpTo ?? 0);
      assert.ok(w.load[e.id] <= cap + 1e-9, `${e.name} has ${w.load[e.id]}h in the week of ${w.weekStart}`);
      if (!e.flexibleUpTo) assert.ok(w.load[e.id] <= (e.weeklyCap ?? rules.contractHoursPerWeek) + 1e-9);
    }
  }
});

test("one shift per person per day, no shift during a lecture, vacation or away day", () => {
  const seen = new Set<string>();
  for (const r of roster.rows) {
    if (!r.employeeId) continue;
    const key = `${r.employeeId}:${r.date}`;
    assert.ok(!seen.has(key), `${key} twice`);
    seen.add(key);
    const e = team.employees.find((x) => x.id === r.employeeId)!;
    const slot = { date: r.date, dow: new Date(r.date + "T00:00:00Z").getUTCDay(), start: r.start, end: r.end, kind: r.kind, hours: r.hours };
    const a = availability(e, { ...slot, start: store.shifts[["sun", "mon", "tue", "wed", "thu", "fri", "sat"][slot.dow]].find((t) => t.kind === r.kind)!.start }, rules);
    assert.ok(a.ok, `${e.name} is not available on ${r.date}`);
    assert.equal(r.start, a.start, `${e.name} on ${r.date} starts at ${r.start}, lecture allows ${a.start}`);
  }
});

test("first shifts never start late", () => {
  for (const r of roster.rows) {
    if (!r.employeeId || (r.kind !== "open" && r.kind !== "early")) continue;
    const planned = store.shifts[["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date(r.date + "T00:00:00Z").getUTCDay()]].find((t) => t.kind === r.kind)!;
    assert.equal(r.start, planned.start);
  }
});

test("eleven hours of rest between two working days", () => {
  const byEmp = new Map<string, typeof roster.rows>();
  for (const r of roster.rows) if (r.employeeId) byEmp.set(r.employeeId, [...(byEmp.get(r.employeeId) ?? []), r]);
  for (const [id, rows] of byEmp) {
    rows.sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 1; i < rows.length; i++) {
      const rest = restHoursBetween(rows[i - 1].date, rows[i - 1].end, rows[i].date, rows[i].start);
      assert.ok(rest >= rules.restBetweenShiftsHours, `${id}: only ${rest}h rest before ${rows[i].date}`);
    }
  }
});

test("days per week are respected", () => {
  const cleo = team.employees.find((e) => e.id === "cleo")!;
  const perWeek = new Map<string, Set<string>>();
  for (const r of roster.rows) if (r.employeeId === "cleo") {
    const w = weekStart(r.date);
    perWeek.set(w, new Set([...(perWeek.get(w) ?? []), r.date]));
  }
  for (const [w, days] of perWeek) assert.ok(days.size <= cleo.maxDaysPerWeek!, `Cleo works ${days.size} days in the week of ${w}`);
});

test("carried over hours count against the first week", () => {
  const week1 = roster.weeks[0];
  const benShifts = roster.rows.filter((r) => r.employeeId === "ben" && r.date < "2026-11-09").reduce((s, r) => s + r.hours, 0);
  assert.equal(week1.load.ben, benShifts + 4.5);
});

test("the same seed gives the same roster, a different seed may not", () => {
  const again = buildRoster(store, team, opts);
  assert.deepEqual(again.rows, roster.rows);
  const other = buildRoster(store, team, { ...opts, seed: 2 });
  assert.equal(other.rows.length, roster.rows.length);
});

test("the report renders every row and the json export carries names", () => {
  const text = renderAll(roster, team);
  assert.match(text, /Mon 2026-11-02/);
  assert.match(text, /Net hours per week \(contract 20h\)/);
  assert.match(text, /Fairness/);
  const json = toJson(roster, team) as { employee: string | null; date: string }[];
  assert.equal(json.length, roster.rows.length);
  assert.ok(json.some((j) => j.employee === "Ada"));
});

test("the defaults match the Austrian rules used in the example", () => {
  assert.equal(DEFAULT_RULES.contractHoursPerWeek, 20);
  assert.equal(DEFAULT_RULES.restBetweenShiftsHours, 11);
  assert.equal(DEFAULT_RULES.maxDailyHours, 10);
});
