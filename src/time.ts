import type { Rules } from "./types.ts";

export const DEFAULT_RULES: Rules = {
  contractHoursPerWeek: 20,
  maxDailyHours: 10,
  shortBreakAfterHours: 6,
  shortBreakHours: 0.5,
  longBreakAfterHours: 10,
  longBreakHours: 1,
  restBetweenShiftsHours: 11,
  minShiftHours: 4,
};

export const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** "11:30" to 11.5 */
export function hm(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h + (m || 0) / 60;
}

/** 11.5 to "11:30" */
export function fmt(h: number): string {
  const whole = Math.floor(h);
  const min = Math.round((h - whole) * 60);
  return `${String(whole).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** The unpaid break the law requires for a presence from start to end. */
export function breakHours(start: string, end: string, rules: Rules): number {
  const gross = hm(end) - hm(start);
  if (gross > rules.longBreakAfterHours) return rules.longBreakHours;
  if (gross > rules.shortBreakAfterHours) return rules.shortBreakHours;
  return 0;
}

/** Worked hours after the break. 11:00 to 22:00 is 10 hours, 11:00 to 15:30 is 4.5. */
export function netHours(start: string, end: string, rules: Rules): number {
  return hm(end) - hm(start) - breakHours(start, end, rules);
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
}

/** 0 = Sunday ... 6 = Saturday */
export function dow(iso: string): number {
  return new Date(iso + "T00:00:00Z").getUTCDay();
}

/** The Monday of the week that holds the date. */
export function weekStart(iso: string): string {
  return addDays(iso, -((dow(iso) + 6) % 7));
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}

/** Hours of rest between the end of one shift and the start of the next. */
export function restHoursBetween(prevDate: string, prevEnd: string, nextDate: string, nextStart: string): number {
  return daysBetween(prevDate, nextDate) * 24 + hm(nextStart) - hm(prevEnd);
}

/** Every date from `from` to `to` inclusive. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
