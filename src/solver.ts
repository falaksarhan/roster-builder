import type { Employee, Row, Rules, Slot, Store, Team } from "./types.ts";
import { availability, isFirstShift } from "./availability.ts";
import { DAY_KEYS, DEFAULT_RULES, dateRange, dow, hm, netHours, restHoursBetween, weekStart } from "./time.ts";

export type Options = {
  from: string;
  to: string;
  seed?: number;      // same seed, same roster
  restarts?: number;  // random restarts per week; more is slower and a little fairer
};

type Count = Record<string, number>;
export type Stats = {
  long: Count;    // full days of more than 10 hours presence
  late: Count;    // closes that end at the latest closing time
  sat: Count;
  fri: Count;
  early: Count;   // short morning shifts
  first: Record<string, Record<number, number>>;  // first shifts per weekday, so openers rotate
};

export type WeekResult = { weekStart: string; rows: Row[]; load: Count; filled: number; score: number; stats: Stats };
export type Roster = { rows: Row[]; weeks: WeekResult[]; stats: Stats; rules: Rules; unfilled: Row[] };

function emptyStats(ids: string[]): Stats {
  const z = () => Object.fromEntries(ids.map((i) => [i, 0]));
  return { long: z(), late: z(), sat: z(), fri: z(), early: z(), first: Object.fromEntries(ids.map((i) => [i, {}])) };
}

/** A small deterministic generator so a roster can be reproduced from its seed. */
export function makeRandom(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

export function weekSlots(dates: string[], store: Store, rules: Rules): Slot[] {
  const closed = new Set(store.closedDates ?? []);
  const out: Slot[] = [];
  for (const date of dates) {
    if (closed.has(date)) continue;
    const d = dow(date);
    for (const t of store.shifts[DAY_KEYS[d]] ?? []) {
      out.push({ date, dow: d, start: t.start, end: t.end, kind: t.kind, hours: netHours(t.start, t.end, rules) });
    }
  }
  return out;
}

const cap = (e: Employee, rules: Rules) => e.weeklyCap ?? rules.contractHoursPerWeek;
const hardCap = (e: Employee, rules: Rules) => Math.max(cap(e, rules), e.flexibleUpTo ?? 0);
const isLong = (s: Slot, rules: Rules) => isFirstShift(s.kind) && hm(s.end) - hm(s.start) > rules.longBreakAfterHours;

function solveWeek(
  slots: Slot[], team: Employee[], carry: Count, G: Stats, prev: Record<string, { date: string; end: string }>,
  rules: Rules, rnd: () => number, restarts: number, latestClose: string,
): Omit<WeekResult, "weekStart"> {
  const ids = team.map((e) => e.id);
  let best: Omit<WeekResult, "weekStart"> | null = null;
  const firsts = slots.filter((s) => isFirstShift(s.kind));
  const seconds = slots.filter((s) => !isFirstShift(s.kind));

  for (let it = 0; it < restarts; it++) {
    const load: Count = Object.fromEntries(ids.map((i) => [i, carry[i] ?? 0]));
    const L = emptyStats(ids);
    const taken = new Map<string, Set<string>>();                       // date -> employees already on that day
    const days: Record<string, Set<string>> = Object.fromEntries(ids.map((i) => [i, new Set<string>()]));
    const shifts: Record<string, Record<string, { start: string; end: string }>> = Object.fromEntries(ids.map((i) => [i, {}]));
    const rows: Row[] = [];
    let filled = 0;

    // Openers first (the shop has to open), the second shifts in random order for variety across restarts.
    const order = [...firsts, ...[...seconds].sort(() => rnd() - 0.5)];

    for (const s of order) {
      if (!taken.has(s.date)) taken.set(s.date, new Set());
      const onThisDay = taken.get(s.date)!;
      const av = new Map<string, string>();  // candidate -> actual start

      const cands = team.filter((e) => {
        if (onThisDay.has(e.id)) return false;
        const a = availability(e, s, rules);
        if (!a.ok) return false;
        const h = netHours(a.start, s.end, rules);
        if (load[e.id] + h > hardCap(e, rules) + 1e-9) return false;
        if (!days[e.id].has(s.date) && days[e.id].size >= (e.maxDaysPerWeek ?? 7)) return false;
        // 11 hours of rest towards the previous and the next working day
        const before = shifts[e.id][dayBefore(s.date)] ?? (prev[e.id]?.date === dayBefore(s.date) ? { start: "", end: prev[e.id].end } : undefined);
        if (before && restHoursBetween(dayBefore(s.date), before.end, s.date, a.start) < rules.restBetweenShiftsHours) return false;
        const after = shifts[e.id][dayAfter(s.date)];
        if (after && restHoursBetween(s.date, s.end, dayAfter(s.date), after.start) < rules.restBetweenShiftsHours) return false;
        av.set(e.id, a.start);
        return true;
      });

      if (!cands.length) {
        rows.push({ date: s.date, employeeId: null, start: s.start, end: s.end, kind: s.kind, hours: s.hours });
        continue;
      }
      const hoursFor = (e: Employee) => netHours(av.get(e.id)!, s.end, rules);
      // Paid contract hours before extra hours.
      const tier = (e: Employee) => (load[e.id] + hoursFor(e) <= cap(e, rules) + 1e-9 ? 0 : 1);
      // Rotate the unpopular shifts: long days, the same weekday's opening, early starts, late closes, Saturdays, Fridays.
      const fair = (e: Employee) =>
        (isLong(s, rules) ? (G.long[e.id] + L.long[e.id]) * 6 : 0) +
        (isFirstShift(s.kind) ? ((G.first[e.id][s.dow] ?? 0) + (L.first[e.id][s.dow] ?? 0)) * 3 : 0) +
        (s.kind === "early" ? (G.early[e.id] + L.early[e.id]) * 3 : 0) +
        (s.kind === "close" && s.end === latestClose ? (G.late[e.id] + L.late[e.id]) * 2 : 0) +
        (s.dow === 6 ? (G.sat[e.id] + L.sat[e.id]) * 5 : 0) +
        (s.dow === 5 ? (G.fri[e.id] + L.fri[e.id]) * 3 : 0);
      cands.sort((x, y) => tier(x) - tier(y) || fair(x) - fair(y) || load[x.id] - load[y.id] || x.id.localeCompare(y.id));
      // 70 percent the best candidate, 30 percent any candidate: the restarts explore different rosters.
      const pick = rnd() < 0.7 ? cands[0] : cands[Math.floor(rnd() * cands.length)];
      const start = av.get(pick.id)!;
      const h = netHours(start, s.end, rules);

      onThisDay.add(pick.id);
      load[pick.id] += h;
      days[pick.id].add(s.date);
      shifts[pick.id][s.date] = { start, end: s.end };
      filled++;
      if (isLong(s, rules)) L.long[pick.id]++;
      if (isFirstShift(s.kind)) L.first[pick.id][s.dow] = (L.first[pick.id][s.dow] ?? 0) + 1;
      if (s.kind === "early") L.early[pick.id]++;
      if (s.kind === "close" && s.end === latestClose) L.late[pick.id]++;
      if (s.dow === 6) L.sat[pick.id]++;
      if (s.dow === 5) L.fri[pick.id]++;
      rows.push({ date: s.date, employeeId: pick.id, start, end: s.end, kind: s.kind, hours: h });
    }

    const over = team.reduce((sum, e) => sum + Math.max(0, load[e.id] - cap(e, rules)), 0);
    const spread = Math.max(...ids.map((i) => load[i])) - Math.min(...ids.map((i) => load[i]));
    const range = (f: "long" | "late" | "sat" | "fri" | "early") => {
      const v = ids.map((i) => G[f][i] + L[f][i]);
      return Math.max(...v) - Math.min(...v);
    };
    const score = spread + over * 100 + range("long") * 4 + range("late") * 2 + range("sat") * 5 + range("fri") * 3 + range("early") * 3;
    if (!best || filled > best.filled || (filled === best.filled && score < best.score)) {
      best = { rows, load, filled, score, stats: L };
    }
  }
  return best!;
}

const dayBefore = (iso: string) => shift(iso, -1);
const dayAfter = (iso: string) => shift(iso, 1);
function shift(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function buildRoster(store: Store, team: Team, opts: Options): Roster {
  const rules: Rules = { ...DEFAULT_RULES, ...(store.rules ?? {}) };
  const rnd = makeRandom(opts.seed ?? 1);
  const restarts = opts.restarts ?? 4000;
  const ids = team.employees.map((e) => e.id);
  const latestClose = Object.values(store.shifts).flat().map((t) => t.end).sort().at(-1) ?? "";

  const byWeek = new Map<string, string[]>();
  for (const date of dateRange(opts.from, opts.to)) {
    const w = weekStart(date);
    byWeek.set(w, [...(byWeek.get(w) ?? []), date]);
  }

  const G = emptyStats(ids);
  const weeks: WeekResult[] = [];
  const rows: Row[] = [];
  let prev: Record<string, { date: string; end: string }> = {};
  for (const [w, dates] of [...byWeek.entries()].sort()) {
    const slots = weekSlots(dates, store, rules);
    const r = solveWeek(slots, team.employees, team.carryOver?.[w] ?? {}, G, prev, rules, rnd, restarts, latestClose);
    for (const id of ids) {
      G.long[id] += r.stats.long[id]; G.late[id] += r.stats.late[id]; G.sat[id] += r.stats.sat[id];
      G.fri[id] += r.stats.fri[id]; G.early[id] += r.stats.early[id];
      for (const d of Object.keys(r.stats.first[id])) G.first[id][+d] = (G.first[id][+d] ?? 0) + r.stats.first[id][+d];
    }
    prev = {};
    for (const row of r.rows) if (row.employeeId) {
      const p = prev[row.employeeId];
      if (!p || p.date < row.date) prev[row.employeeId] = { date: row.date, end: row.end };
    }
    weeks.push({ weekStart: w, ...r });
    rows.push(...r.rows);
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  return { rows, weeks, stats: G, rules, unfilled: rows.filter((r) => !r.employeeId) };
}
