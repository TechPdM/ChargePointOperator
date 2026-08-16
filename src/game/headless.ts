/**
 * Phase 1 CLI entry point — runs scenarios with no UI.
 *
 * Usage:
 *   npm run sim -- run    [--seed s1] [--policy baseline|none] [--ndjson out.ndjson]
 *   npm run sim -- batch  [--seeds 20] [--policy baseline|none] [--json out.json]
 *   npm run sim -- trace  [--seed s1] [--from 700] [--to 780]
 *
 * `batch` is what closes OPEN-3: it reports mean AND p10/p90 per KPI, because a
 * mean inside the expected band tells you nothing about whether 30% of seeds
 * are wild.
 */

import { writeFileSync } from "node:fs";
import { queueAction } from "./actions/playerActions.ts";
import { runScenario } from "./core/run.ts";
import { createInitialState } from "./core/init.ts";
import { roadsideHub } from "./scenarios/roadsideHub.ts";
import { baselinePolicy, passivePolicy } from "./experiment/baselinePolicy.ts";
import { stat, summariseRun, type RunSummary, type Stat } from "./experiment/compareRuns.ts";
import { formatTraceLine, traceTick } from "./validation/trace.ts";
import type {
  MaintenanceLevel,
  PowerPolicy,
  ScenarioConfig,
  ScenarioGoals,
} from "./core/types.ts";

interface Args {
  command: string;
  seed: string;
  seeds: number;
  policy: "baseline" | "none";
  ndjson?: string;
  json?: string;
  from: number;
  to: number;
  /** Starting-policy overrides, so a batch can measure an alternative. */
  maintenance?: MaintenanceLevel;
  power?: PowerPolicy;
  price?: number;
  partial?: number;
  grid?: number;
}

/**
 * Overrides apply to the scenario's INITIAL policy, so the whole run is played
 * under them. This is the seam Phase 3's sensitivity sweeps plug into.
 */
function withOverrides(args: Args): ScenarioConfig {
  return {
    ...roadsideHub,
    initialMaintenanceLevel: args.maintenance ?? roadsideHub.initialMaintenanceLevel,
    initialPowerPolicy: args.power ?? roadsideHub.initialPowerPolicy,
    initialPricePerKwh: args.price ?? roadsideHub.initialPricePerKwh,
    initialPartialChargeTargetSoc: args.partial ?? roadsideHub.initialPartialChargeTargetSoc,
    initialGridPowerKw: args.grid ?? roadsideHub.initialGridPowerKw,
  };
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    command: argv[0] && !argv[0].startsWith("--") ? argv[0] : "run",
    seed: "s1",
    seeds: 20,
    policy: "baseline",
    from: 0,
    to: 1_440,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (!flag?.startsWith("--") || value === undefined) continue;
    switch (flag) {
      case "--seed":
        args.seed = value;
        break;
      case "--seeds":
        args.seeds = Number(value);
        break;
      case "--policy":
        args.policy = value === "none" ? "none" : "baseline";
        break;
      case "--ndjson":
        args.ndjson = value;
        break;
      case "--json":
        args.json = value;
        break;
      case "--from":
        args.from = Number(value);
        break;
      case "--to":
        args.to = Number(value);
        break;
      case "--maintenance":
        args.maintenance = value as MaintenanceLevel;
        break;
      case "--power":
        args.power = value as PowerPolicy;
        break;
      case "--price":
        args.price = Number(value);
        break;
      case "--partial":
        args.partial = value === "off" ? undefined : Number(value);
        break;
      case "--grid":
        args.grid = Number(value);
        break;
    }
  }
  return args;
}

const GOAL_LABELS: Record<keyof ScenarioGoals, string> = {
  minOperatingMargin: "margin",
  maxAvgWaitSeconds: "avg wait",
  minTrust: "trust",
  minSessionsCompleted: "sessions",
};

function money(value: number): string {
  return `£${value.toFixed(2)}`;
}

function printSummary(s: RunSummary): void {
  const goals = (Object.keys(GOAL_LABELS) as (keyof ScenarioGoals)[])
    .map((k) => `${GOAL_LABELS[k]}:${s.goalsMet[k] ? "✓" : "✗"}`)
    .join(" ");
  console.log(`
  seed ................ ${s.seed}  (${s.policyLabel})
  outcome ............. ${s.outcome}   goals ${s.goalsMetCount}/4   ${goals}
  arrivals ............ ${s.arrivals}  (rejected ${s.rejectedSite}, site-full ${s.siteFull})
  sessions completed .. ${s.sessionsCompleted}
  cum margin .......... ${money(s.cumMargin)}
  end cash ............ ${money(s.endCash)}
  cum avg wait ........ ${(s.cumAvgWaitSeconds / 60).toFixed(1)} sim-min
  abandonment ......... ${s.cumAbandonmentRatePct.toFixed(1)}%
  utilization ......... ${s.cumUtilizationPct.toFixed(1)}%
  uptime .............. ${s.cumUptimePct.toFixed(2)}%
  session success ..... ${s.sessionSuccessRatePct.toFixed(1)}%
  charge-start success  ${s.chargeStartSuccessRatePct.toFixed(1)}%
  energy delivered .... ${s.kwhDelivered.toFixed(0)} kWh
  faults .............. ${s.faults}
  trust ............... ${s.trust.toFixed(1)}   (clamp hits ${s.trustClampHits})
  failure states ...... ${s.failureStatesObserved.join(", ") || "none"}
  final state hash .... ${s.finalStateHash}`);
}

function commandRun(args: Args): void {
  const result = runScenario({
    scenario: withOverrides(args),
    seed: args.seed,
    policy: args.policy === "baseline" ? baselinePolicy : passivePolicy,
    policyLabel: args.policy === "baseline" ? "baseline" : "played",
  });
  printSummary(summariseRun(result));
  if (result.finalViolations.length > 0) {
    console.error("\n  FINAL INVARIANT VIOLATIONS:");
    for (const v of result.finalViolations) console.error(`   - inv ${v.invariant}: ${v.message}`);
    process.exitCode = 1;
  }
  if (args.ndjson) {
    writeFileSync(args.ndjson, result.logger.exportNdjson(), "utf8");
    console.log(`\n  wrote ${result.logger.getEvents().length} events → ${args.ndjson}`);
  }
}

function fmtStat(s: Stat, dp = 1): string {
  return `${s.mean.toFixed(dp)}  [p10 ${s.p10.toFixed(dp)} · p50 ${s.p50.toFixed(dp)} · p90 ${s.p90.toFixed(dp)}]`;
}

function commandBatch(args: Args): void {
  const summaries: RunSummary[] = [];
  const started = process.hrtime.bigint();
  const scenario = withOverrides(args);

  for (let i = 1; i <= args.seeds; i++) {
    const seed = `s${i}`;
    const result = runScenario({
      scenario,
      seed,
      policy: args.policy === "baseline" ? baselinePolicy : passivePolicy,
      policyLabel: args.policy === "baseline" ? "baseline" : "played",
      logLevel: "info",
    });
    summaries.push(summariseRun(result));
    if (result.finalViolations.length > 0) {
      console.error(`  seed ${seed}: ${result.finalViolations.length} final invariant violations`);
      process.exitCode = 1;
    }
  }

  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  const pick = (f: (s: RunSummary) => number): Stat => stat(summaries.map(f));

  const failsAGoal = summaries.filter((s) => s.goalsMetCount < 4).length;
  const floorPct = (failsAGoal / summaries.length) * 100;

  console.log(`\n  BASELINE BATCH — ${args.seeds} seeds, ${scenario.name} (${elapsedMs.toFixed(0)} ms)`);
  console.log(
    `  policy: £${scenario.initialPricePerKwh.toFixed(2)}/kWh · ${scenario.initialMaintenanceLevel}` +
      ` · ${scenario.initialPowerPolicy} · partial-charge ` +
      `${scenario.initialPartialChargeTargetSoc ?? "off"} · grid ${scenario.initialGridPowerKw} kW\n`,
  );
  console.log(`  arrivals ............ ${fmtStat(pick((s) => s.arrivals), 0)}`);
  console.log(`  sessions completed .. ${fmtStat(pick((s) => s.sessionsCompleted), 0)}`);
  console.log(`  utilization % ....... ${fmtStat(pick((s) => s.cumUtilizationPct))}`);
  console.log(`  avg wait (sim-min) .. ${fmtStat(pick((s) => s.cumAvgWaitSeconds / 60))}`);
  console.log(`  abandonment % ....... ${fmtStat(pick((s) => s.cumAbandonmentRatePct))}`);
  console.log(`  uptime % ............ ${fmtStat(pick((s) => s.cumUptimePct), 2)}`);
  console.log(`  session success % ... ${fmtStat(pick((s) => s.sessionSuccessRatePct))}`);
  console.log(`  charge-start succ % . ${fmtStat(pick((s) => s.chargeStartSuccessRatePct))}`);
  console.log(`  cum margin (£) ...... ${fmtStat(pick((s) => s.cumMargin), 0)}`);
  console.log(`  end cash (£) ........ ${fmtStat(pick((s) => s.endCash), 0)}`);
  console.log(`  trust ............... ${fmtStat(pick((s) => s.trust))}`);
  console.log(`  faults/day .......... ${fmtStat(pick((s) => s.faults), 2)}`);
  console.log(`  kWh delivered ....... ${fmtStat(pick((s) => s.kwhDelivered), 0)}`);
  console.log(`  rejected at gate .... ${fmtStat(pick((s) => s.rejectedSite), 0)}`);
  console.log(`  turned away (full) .. ${fmtStat(pick((s) => s.siteFull), 0)}`);

  console.log(`\n  GOALS`);
  for (const key of Object.keys(GOAL_LABELS) as (keyof ScenarioGoals)[]) {
    const met = summaries.filter((s) => s.goalsMet[key]).length;
    console.log(
      `  ${GOAL_LABELS[key].padEnd(18, ".")} met on ${met}/${summaries.length} seeds` +
        ` (${((met / summaries.length) * 100).toFixed(0)}%)`,
    );
  }

  console.log(
    `\n  D13 difficulty floor: baseline fails ≥1 goal on ${failsAGoal}/${summaries.length}` +
      ` seeds (${floorPct.toFixed(0)}%) — needs ≥80%. ${floorPct >= 80 ? "PASS" : "FAIL"}`,
  );

  const observed = new Map<string, number>();
  for (const s of summaries) {
    for (const f of s.failureStatesObserved) observed.set(f, (observed.get(f) ?? 0) + 1);
  }
  console.log(`\n  Failure states observed across the batch:`);
  if (observed.size === 0) console.log("    none");
  for (const [name, count] of [...observed].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${name.padEnd(20, ".")} ${count}/${summaries.length} seeds`);
  }

  if (args.json) {
    writeFileSync(args.json, JSON.stringify(summaries, null, 2), "utf8");
    console.log(`\n  wrote ${summaries.length} summaries → ${args.json}`);
  }
}

function commandTrace(args: Args): void {
  const scenario = withOverrides(args);
  let state = createInitialState(scenario, args.seed);
  const maxTicks = Math.ceil(scenario.durationSeconds / scenario.tickSeconds);
  for (let i = 0; i < maxTicks && state.running; i++) {
    for (const action of baselinePolicy(state)) state = queueAction(state, action);
    const { next, line } = traceTick(state);
    state = next;
    if (line.tick >= args.from && line.tick <= args.to) console.log(formatTraceLine(line));
  }
}

const args = parseArgs(process.argv.slice(2));
switch (args.command) {
  case "batch":
    commandBatch(args);
    break;
  case "trace":
    commandTrace(args);
    break;
  default:
    commandRun(args);
}
