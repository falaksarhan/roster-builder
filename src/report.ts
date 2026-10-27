import type { Employee, Row, Rules, Team } from "./types.ts";
import type { Roster } from "./solver.ts";
import { DAY_NAMES, breakHours, dow, hm } from "./time.ts";

const KIND = { open: "OPEN ", early: "EARLY", late: "LATE ", close: "CLOSE" } as const;

function nameOf(team: Team, id: string | null): string {
  return id ? team.employees.find((e) => e.id === id)?.name ?? id : "";
}

export function renderRoster(roster: Roster, team: Team): string {
  const lines: string[] = [];
  let current = "";
  for (const r of roster.rows) {
    if (r.date !== current) {
      current = r.date;
      lines.push("", `${DAY_NAMES[dow(r.date)]} ${r.date}`);
    }
    const brk = breakHours(r.start, r.end, roster.rules);
    const who = r.employeeId ? nameOf(team, r.employeeId) : "*** OPEN, nobody available under the rules ***";
    lines.push(`   ${KIND[r.kind]} ${r.start} to ${r.end}  ${who}  (${r.hours}h net${brk ? `, ${brk}h break` : ""})`);
  }
  return lines.join("\n").trimStart();
}

export function renderWeekHours(roster: Roster, team: Team): string {
  const rules = roster.rules;
  const lines = [`Net hours per week (contract ${rules.contractHoursPerWeek}h)`];
  for (const w of roster.weeks) {
    const cells = team.employees.map((e) => {
      const h = w.load[e.id];
      const cap = e.weeklyCap ?? rules.contractHoursPerWeek;
      return `${e.name} ${h.toFixed(1)}${h > cap + 1e-9 ? ` (+${(h - cap).toFixed(1)} extra)` : ""}`;
    });
    const total = team.employees.reduce((s, e) => s + w.load[e.id], 0);
    lines.push(`  week of ${w.weekStart}: ${cells.join(" | ")}  = ${total.toFixed(1)}h`);
  }
  return lines.join("\n");
}

export function renderUnfilled(roster: Roster): string {
  const u = roster.unfilled;
  const hours = u.reduce((s, r) => s + r.hours, 0);
  const lines = [`Unfilled: ${u.length} shift(s), ${hours.toFixed(1)}h`];
  for (const r of u) lines.push(`   ${DAY_NAMES[dow(r.date)]} ${r.date} ${r.kind} ${r.start} to ${r.end} (${r.hours}h)`);
  return lines.join("\n");
}

/** Who took the unpopular shifts, and how far that is from a fair share. */
export function renderFairness(roster: Roster, team: Team): string {
  const rules = roster.rules;
  const latestClose = roster.rows.map((r) => r.end).sort().at(-1) ?? "";
  const z = () => Object.fromEntries(team.employees.map((e) => [e.id, 0])) as Record<string, number>;
  const openers = z(), closers = z(), longDays = z(), lateCloses = z(), saturdays = z(), fridays = z();
  const byDate = new Map<string, Row[]>();
  for (const r of roster.rows) if (r.employeeId) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]);
  for (const [date, shifts] of byDate) {
    const d = dow(date);
    const first = shifts.reduce((a, b) => (a.start <= b.start ? a : b));
    const last = shifts.reduce((a, b) => (a.end >= b.end && a !== first ? a : b));
    openers[first.employeeId!]++;
    if (last !== first) closers[last.employeeId!]++;
    if (hm(first.end) - hm(first.start) > rules.longBreakAfterHours) longDays[first.employeeId!]++;
    for (const s of shifts) {
      if (s.kind === "close" && s.end === latestClose) lateCloses[s.employeeId!]++;
      if (d === 6) saturdays[s.employeeId!]++;
      if (d === 5) fridays[s.employeeId!]++;
    }
  }
  const col = (n: number, w: number) => String(n).padStart(w);
  const lines = ["Fairness", "Name          Opens  Closes | Long days  Late closes | Saturdays  Fridays"];
  for (const e of team.employees) {
    lines.push(`${e.name.padEnd(12)}${col(openers[e.id], 7)}${col(closers[e.id], 8)} |${col(longDays[e.id], 10)}${col(lateCloses[e.id], 13)} |${col(saturdays[e.id], 10)}${col(fridays[e.id], 9)}`);
  }
  // Score: distance from each person's fair share, weighted by how unpopular the shift is. Lower is fairer.
  const shares = Object.fromEntries(team.employees.map((e) => [e.id, e.share ?? 1]));
  const shareSum = Object.values(shares).reduce((a, b) => a + b, 0);
  const dev = (m: Record<string, number>, weight: number) => {
    const total = Object.values(m).reduce((a, b) => a + b, 0);
    return team.employees.reduce((a, e) => a + Math.abs(m[e.id] - (total * shares[e.id]) / shareSum), 0) * weight;
  };
  const score = dev(longDays, 4) + dev(lateCloses, 2) + dev(openers, 1) + dev(closers, 1) + dev(saturdays, 5) + dev(fridays, 3);
  lines.push(`Score ${score.toFixed(2)} (lower is fairer)`);
  return lines.join("\n");
}

export function renderAll(roster: Roster, team: Team): string {
  return [renderRoster(roster, team), "", renderWeekHours(roster, team), "", renderUnfilled(roster), "", renderFairness(roster, team)].join("\n");
}

export function toJson(roster: Roster, team: Team): object[] {
  return roster.rows.map((r) => ({
    date: r.date, employeeId: r.employeeId, employee: nameOf(team, r.employeeId) || null,
    start: r.start, end: r.end, kind: r.kind, hours: r.hours,
  }));
}

export function describeEmployee(e: Employee, rules: Rules): string {
  const bits = [`${e.weeklyCap ?? rules.contractHoursPerWeek}h/week`];
  if (e.flexibleUpTo) bits.push(`extra hours up to ${e.flexibleUpTo}h`);
  if (e.maxDaysPerWeek) bits.push(`max ${e.maxDaysPerWeek} days`);
  if (e.lectures?.length) bits.push(`${e.lectures.length} lecture block(s)`);
  if (e.vacations?.length) bits.push(`vacation ${e.vacations.map((v) => `${v.from} to ${v.to}`).join(", ")}`);
  return `${e.name}: ${bits.join(", ")}`;
}
