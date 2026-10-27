#!/usr/bin/env node
// Usage:
//   node src/cli.ts --store examples/store.json --team examples/team.json --from 2026-11-02 --to 2026-11-29
//   options: --seed 7   --restarts 4000   --json roster.json
import { readFileSync, writeFileSync } from "node:fs";
import type { Store, Team } from "./types.ts";
import { buildRoster } from "./solver.ts";
import { describeEmployee, renderAll, toJson } from "./report.ts";

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1 || !process.argv[i + 1]) {
    if (fallback !== undefined) return fallback;
    console.error(`missing --${name}`);
    process.exit(2);
  }
  return process.argv[i + 1];
}

const store: Store = JSON.parse(readFileSync(arg("store"), "utf8"));
const team: Team = JSON.parse(readFileSync(arg("team"), "utf8"));
const roster = buildRoster(store, team, {
  from: arg("from"),
  to: arg("to"),
  seed: Number(arg("seed", "1")),
  restarts: Number(arg("restarts", "4000")),
});

console.log(`${store.name ?? "Roster"}, ${arg("from")} to ${arg("to")}, seed ${arg("seed", "1")}`);
for (const e of team.employees) console.log(`  ${describeEmployee(e, roster.rules)}`);
console.log();
console.log(renderAll(roster, team));

const out = arg("json", "");
if (out) {
  writeFileSync(out, JSON.stringify(toJson(roster, team), null, 2));
  console.log(`\nwritten: ${out}`);
}
