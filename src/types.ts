// The input shapes. Everything is plain JSON, see examples/.

export type Kind = "open" | "early" | "late" | "close";
// open / early: the first shift of the day, the shop has to be opened on time.
// late / close: the second shift; it may start later than planned when a lecture ends after
// its planned start, as long as enough of the shift is left.

export type ShiftTemplate = { start: string; end: string; kind: Kind };

export type Rules = {
  contractHoursPerWeek: number;  // paid hours per week per person; the student permit cap is 20
  maxDailyHours: number;         // AZG section 9: no more than 10 hours worked on one day
  shortBreakAfterHours: number;  // AZG section 11: a 30 minute break once the day exceeds 6 hours
  shortBreakHours: number;
  longBreakAfterHours: number;   // a one hour break when the presence exceeds 10 hours, so the worked time stays at 10
  longBreakHours: number;
  restBetweenShiftsHours: number; // AZG section 12: 11 hours of rest between two working days
  minShiftHours: number;         // a shift that starts late must still be at least this long
};

export type Store = {
  name?: string;
  shifts: Record<string, ShiftTemplate[]>;   // keyed by weekday: mon, tue, ... ; a missing day is a closed day
  closedDates?: string[];                    // public holidays and other closed dates, ISO format
  rules?: Partial<Rules>;
};

export type Lecture = { day: string; from: string; to: string };

export type Employee = {
  id: string;
  name: string;
  weeklyCap?: number;        // contract hours per week; defaults to rules.contractHoursPerWeek
  flexibleUpTo?: number;     // may work extra hours up to this many per week (lecture free time, agreed with the person)
  maxDaysPerWeek?: number;   // defaults to 7
  lectures?: Lecture[];      // weekly class timetable
  lectureWeeks?: { from: string; to: string };  // the semester; lectures outside it are ignored
  vacations?: { from: string; to: string }[];
  away?: string[];           // single dates the person cannot work
  share?: number;            // fair share of the unpopular shifts, 1 by default; 0.75 for someone absent a quarter of the period
};

export type Team = {
  employees: Employee[];
  carryOver?: Record<string, Record<string, number>>;  // hours already published in a week, keyed by the Monday, then employee id
};

export type Slot = { date: string; dow: number; start: string; end: string; kind: Kind; hours: number };

export type Row = {
  date: string;
  employeeId: string | null;   // null: nobody could take the shift under the rules
  start: string;
  end: string;
  kind: Kind;
  hours: number;               // net hours after the legal break
};
