import type { Employee, Kind, Lecture, Rules, Slot } from "./types.ts";
import { DAY_KEYS, hm } from "./time.ts";

export const isFirstShift = (kind: Kind): boolean => kind === "open" || kind === "early";

const NO = { ok: false as const, start: "" };

function lecturesOn(emp: Employee, slot: Slot): Lecture[] {
  if (!emp.lectures?.length) return [];
  const w = emp.lectureWeeks;
  if (w && (slot.date < w.from || slot.date > w.to)) return [];
  const key = DAY_KEYS[slot.dow];
  return emp.lectures.filter((l) => l.day.toLowerCase().slice(0, 3) === key).sort((a, b) => hm(a.from) - hm(b.from));
}

/**
 * Can this person take this shift, and from what time?
 * Vacations and single away days block the day. A lecture that overlaps a first shift blocks
 * it (someone has to open the shop). A lecture that overlaps the beginning of a second shift
 * moves the start to the end of the lecture, as long as at least rules.minShiftHours remain.
 * A lecture in the middle or at the end of a shift blocks it.
 */
export function availability(emp: Employee, slot: Slot, rules: Rules): { ok: boolean; start: string } {
  if (emp.away?.includes(slot.date)) return NO;
  if (emp.vacations?.some((v) => v.from <= slot.date && slot.date <= v.to)) return NO;
  let start = slot.start;
  for (const l of lecturesOn(emp, slot)) {
    const overlaps = hm(l.from) < hm(slot.end) && hm(l.to) > hm(start);
    if (!overlaps) continue;
    if (isFirstShift(slot.kind)) return NO;
    if (hm(l.from) > hm(start)) return NO;
    start = l.to;
  }
  if (start !== slot.start && hm(slot.end) - hm(start) < rules.minShiftHours) return NO;
  return { ok: true, start };
}
