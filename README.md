# roster-builder

![tests](https://github.com/falaksarhan/roster-builder/actions/workflows/tests.yml/badge.svg)

Turns a team of student employees, their class timetables and their vacations into a monthly shift roster that keeps the 20 hour student permit cap and the Austrian working time rules.

I wrote it for my own shop, Pinkberry in the PlusCity mall in Linz, Austria. The whole team studies at the university, every one of them may work 20 hours a week on their student permit, and the shop is open six days a week from late morning to 20:00 or 22:00. Before this, I built the monthly roster by hand and still broke a rule somewhere every month. The real version writes its draft into our staff app, where the team sees the published roster, swaps shifts and keeps their hours account. This public version is the same solver with the database part removed and an example team instead of mine.

## What it does

You give it two JSON files:

* `store.json`: the shifts the shop needs on each weekday (an opener and a second person, with start and end times), the closed dates, and the rules.
* `team.json`: the people, their weekly cap, whether they agreed to extra hours in lecture free time, their weekly lectures, their vacations, single days they cannot work, and hours already published in a week.

It prints the roster for the period, the net hours per person and week, the shifts nobody could take, and a fairness table. With `--json` it also writes the rows for whatever system publishes the roster.

## The rules it keeps

* **20 hours a week per person.** That is the student permit cap in Austria. A person who agreed to extra hours in lecture free time gets `flexibleUpTo`; the solver fills paid contract hours first and reports the extra hours separately.
* **Nobody is scheduled during a lecture.** The opener has to be there when the shop opens, so a lecture that overlaps a first shift rules the person out. A second shift may start when the lecture ends, as long as at least four hours of the shift remain.
* **Breaks.** A day of more than six hours gets a 30 minute break (AZG section 11). A day with eleven hours of presence gets a one hour break, so the worked time stays at the ten hour daily maximum (AZG section 9). Net hours are counted after the break.
* **Eleven hours of rest** between two working days (AZG section 12), also across the weekend.
* **One shift per person per day**, and an optional maximum of working days per week per person.
* **Vacations, away days and closed dates** (public holidays) block the day.
* **Carry over.** Hours already published in a week, for example from a roster that was changed halfway, count against that week.
* **Fairness.** Long days, Saturdays, Fridays, late closes, early starts and the opening of the same weekday rotate between people instead of landing on the same person every week. A person who is away part of the period gets a smaller fair share.

## How it solves

Week by week. For every week it tries 4,000 random rosters: the first shifts of each day are filled first (someone has to open), the second shifts in random order. For each shift the candidates are filtered by the hard rules above, then sorted by contract hours before extra hours, by the fairness score, and by the hours they already have that week. Seven times out of ten the best candidate gets the shift, three times out of ten any candidate, which is what makes the 4,000 tries different from each other. The best try is the one with the fewest unfilled shifts and, among those, the lowest score: spread of hours between people, a heavy penalty on extra hours, and the ranges of the fairness counters. The random generator is seeded, so the same input and seed give the same roster.

A heuristic with restarts, not an optimizer. For a team of four to six people and a month it finds a complete roster in about two seconds and the result is good enough to publish. For a bigger team you would want real constraint solving.

## Run

Needs Node 23.6 or newer, which runs TypeScript directly. No build step, no dependencies.

```bash
node src/cli.ts --store examples/store.json --team examples/team.json --from 2026-11-02 --to 2026-11-29
```

Options: `--seed 7` for another roster from the same input, `--restarts 10000` for more tries, `--json roster.json` to write the rows.

```bash
npm test
```

runs the 20 tests with the test runner built into Node: breaks and net hours, rest across midnight, lecture overlaps and late starts, and a full month checked against every rule.

## Example

![The roster builder planning November for the example team](docs/demo.gif)

The example team: Ada (lectures Thursday and Friday), Ben (lectures Monday and Tuesday, may do extra hours), Cleo (at most three days a week, lectures Wednesday and all Friday), Dario (lectures Tuesday afternoon, may do extra hours, on vacation one week). Ben already has 4.5 hours published in the first week.

```
Example shop in a mall, one counter, two people a day, 2026-11-02 to 2026-11-29, seed 1
  Ada: 20h/week, 2 lecture block(s)
  Ben: 20h/week, extra hours up to 40h, 2 lecture block(s)
  Cleo: 20h/week, max 3 days, 2 lecture block(s)
  Dario: 20h/week, extra hours up to 40h, 1 lecture block(s), vacation 2026-11-16 to 2026-11-22

Mon 2026-11-02
   EARLY 11:00 to 15:30  Dario  (4.5h net)
   LATE  15:30 to 20:00  Ada  (4.5h net)

Tue 2026-11-03
   EARLY 11:00 to 15:30  Ada  (4.5h net)
   LATE  15:30 to 20:00  Cleo  (4.5h net)

Wed 2026-11-04
   EARLY 10:30 to 15:30  Ben  (5h net)
   LATE  15:30 to 20:00  Ada  (4.5h net)

Thu 2026-11-05
   OPEN  11:00 to 22:00  Cleo  (10h net, 1h break)
   CLOSE 16:00 to 22:00  Ada  (6h net)

Fri 2026-11-06
   OPEN  11:00 to 22:00  Ben  (10h net, 1h break)
   CLOSE 14:00 to 22:00  Dario  (7.5h net, 0.5h break)

Sat 2026-11-07
   OPEN  11:00 to 19:00  Dario  (7.5h net, 0.5h break)
   CLOSE 14:00 to 19:00  Cleo  (5h net)

...

Fri 2026-11-27
   OPEN  11:00 to 22:00  Dario  (10h net, 1h break)
   CLOSE 15:00 to 22:00  Ada  (6.5h net, 0.5h break)

Net hours per week (contract 20h)
  week of 2026-11-02: Ada 19.5 | Ben 19.5 | Cleo 19.5 | Dario 19.5  = 78.0h
  week of 2026-11-09: Ada 18.5 | Ben 18.0 | Cleo 18.5 | Dario 15.0  = 70.0h
  week of 2026-11-16: Ada 20.0 | Ben 31.5 (+11.5 extra) | Cleo 18.5 | Dario 0.0  = 70.0h
  week of 2026-11-23: Ada 15.5 | Ben 19.5 | Cleo 18.0 | Dario 19.5  = 72.5h

Unfilled: 0 shift(s), 0.0h

Fairness
Name          Opens  Closes | Long days  Late closes | Saturdays  Fridays
Ada               3      12 |         0            3 |         2        1
Ben               8       5 |         3            1 |         2        2
Cleo              7       5 |         3            3 |         2        2
Dario             6       2 |         2            1 |         2        3
Score 54.40 (lower is fairer)
```

Ada's Friday close starts at 15:00 instead of 14:00 because her lecture ends at 15:00. In the week Dario is on vacation, Ben, who agreed to extra hours, carries the gap and the report says so.

## Input format

`examples/store.json`

```json
{
  "shifts": {
    "mon": [{ "start": "11:00", "end": "15:30", "kind": "early" }, { "start": "15:30", "end": "20:00", "kind": "late" }],
    "thu": [{ "start": "11:00", "end": "22:00", "kind": "open" },  { "start": "16:00", "end": "22:00", "kind": "close" }]
  },
  "closedDates": ["2026-12-25", "2026-12-26"],
  "rules": { "contractHoursPerWeek": 20, "restBetweenShiftsHours": 11, "minShiftHours": 4 }
}
```

`open` and `early` are first shifts, `late` and `close` are second shifts. A weekday without shifts is a closed day. Every rule has a default, see `src/time.ts`.

`examples/team.json`

```json
{
  "employees": [
    {
      "id": "ada", "name": "Ada", "weeklyCap": 20,
      "lectures": [{ "day": "thu", "from": "08:00", "to": "13:00" }, { "day": "fri", "from": "09:00", "to": "15:00" }],
      "lectureWeeks": { "from": "2026-10-01", "to": "2027-01-31" },
      "vacations": [{ "from": "2026-11-23", "to": "2026-11-29" }],
      "away": ["2026-11-06"],
      "flexibleUpTo": 40, "maxDaysPerWeek": 5, "share": 1
    }
  ],
  "carryOver": { "2026-11-02": { "ada": 4.5 } }
}
```

## Files

```
src/time.ts          hours, breaks, rest, weeks, the default rules
src/availability.ts  can this person take this shift, and from what time
src/solver.ts        the week solver with restarts and the fairness counters
src/report.ts        the printed roster, hours, unfilled shifts, fairness table, JSON export
src/cli.ts           command line
examples/            an example shop and team
docs/demo.gif        the example run, recorded
test/                20 tests, node --test
```

## Limits

No shift wishes yet (someone who wants Tuesdays off asks for a lecture block). One shop, one counter. The weights in the fairness score are the ones that worked for my team; they are constants at the top of `src/solver.ts`. The law references are to the Austrian Arbeitszeitgesetz as I apply it in my own shop; check them with your own advisor before you rely on them.

MIT, Falak Sarhan Saade.
