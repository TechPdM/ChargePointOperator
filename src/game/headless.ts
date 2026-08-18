/**
 * Phase 1 CLI entry point — runs scenarios with no UI.
 *
 * Usage:
 *   npm run sim -- run    [--seed s1] [--policy baseline|none] [--ndjson out.ndjson]
 *   npm run sim -- batch  [--seeds 20] [--policy baseline|none] [--json out.json]
 *   npm run sim -- trace  [--seed s1] [--from 700] [--to 780]
 *   npm run sim -- sweep  [--seeds 8] [--axis pricePerKwh]
 *   npm run sim -- archetypes [--seeds 20]
 *   npm run sim -- strategies [--seeds 8]     — the gate criterion 2 test
 *   npm run sim -- gate   [--seeds 10]        — the Phase 4 scorecard, machine half
 *
 * All commands take --scenario roadside|commuter|destination.
 *
 * `batch` is what closes OPEN-3: it reports mean AND p10/p90 per KPI, because a
 * mean inside the expected band tells you nothing about whether 30% of seeds
 * are wild.
 */

import { writeFileSync } from "node:fs";
import { queueAction } from "./actions/playerActions.ts";
import { runScenario } from "./core/run.ts";
import { createInitialState } from "./core/init.ts";
import { ALL_SCENARIOS, findScenario, roadsideHub } from "./scenarios/index.ts";
import { baselinePolicy, passivePolicy } from "./experiment/baselinePolicy.ts";
import { stat, summariseRun, type RunSummary, type Stat } from "./experiment/compareRuns.ts";
import { formatTraceLine, traceTick } from "./validation/trace.ts";
import { runSweep, sanityAxes, type SweepResult } from "./experiment/sweep.ts";
import {
  judgeDominance,
  MIN_SEEDS_FOR_DOMINANCE,
  scoreStrategy,
  STRATEGIES,
  type DominanceVerdict,
  type StrategyScore,
} from "./experiment/strategies.ts";
import {
  gatherDecisionsMatter,
  gatherDominance,
  gatherFailureStates,
  playtestProbes,
} from "./experiment/gateEvidence.ts";
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
  scenario: string;
  axis?: string;
}

/**
 * Overrides apply to the scenario's INITIAL policy, so the whole run is played
 * under them. This is the seam Phase 3's sensitivity sweeps plug into.
 */
function withOverrides(args: Args): ScenarioConfig {
  const base = findScenario(args.scenario);
  return {
    ...base,
    initialMaintenanceLevel: args.maintenance ?? base.initialMaintenanceLevel,
    initialPowerPolicy: args.power ?? base.initialPowerPolicy,
    initialPricePerKwh: args.price ?? base.initialPricePerKwh,
    initialPartialChargeTargetSoc: args.partial ?? base.initialPartialChargeTargetSoc,
    initialGridPowerKw: args.grid ?? base.initialGridPowerKw,
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
    scenario: roadsideHub.id,
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
      case "--scenario":
        args.scenario = value;
        break;
      case "--axis":
        args.axis = value;
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

function printSweep(result: SweepResult): void {
  console.log(`\n  ${result.axis.toUpperCase()}`);
  if (result.notes) console.log(`  expected: ${result.notes}`);

  const metrics = result.verdicts.map((v) => v.metric);
  const header = ["value".padEnd(12), ...metrics.map((m) => m.padStart(22))].join("");
  console.log(`\n  ${header}`);
  result.cells.forEach((cell, i) => {
    const row = metrics.map((m) => {
      const value = cell.metrics[m].mean;
      return (Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(2)).padStart(22);
    });
    console.log(`  ${cell.label.padEnd(12)}${row.join("")}`);
    void i;
  });

  console.log("");
  for (const v of result.verdicts) {
    const mark = v.pass ? "PASS" : "FAIL";
    console.log(
      `  [${mark}] ${v.metric.padEnd(24)} expected ${v.expected.padEnd(13)} observed ${v.observed}`,
    );
  }
}

function commandSweep(args: Args): void {
  const scenario = withOverrides(args);
  const axes = sanityAxes().filter((a) => !args.axis || a.name === args.axis);
  if (axes.length === 0) {
    console.error(`No axis named "${args.axis}". Available: ${sanityAxes().map((a) => a.name).join(", ")}`);
    process.exitCode = 1;
    return;
  }

  console.log(`\n  SANITY GRADIENTS — ${scenario.name}, ${args.seeds} seeds per point`);
  console.log("  Calibration §8: a flat or inverted gradient is a finding-killer.");

  const results = axes.map((axis) => {
    const result = runSweep(axis, { scenario, seeds: args.seeds });
    printSweep(result);
    return result;
  });

  const all = results.flatMap((r) => r.verdicts);
  const failed = all.filter((v) => !v.pass);
  console.log(`\n  ${all.length - failed.length}/${all.length} gradients behave as specified.`);
  for (const v of failed) {
    const axis = results.find((r) => r.verdicts.includes(v))?.axis;
    console.log(`    FAILED: ${axis} → ${v.metric} (expected ${v.expected}, got ${v.observed})`);
  }
  if (args.json) {
    writeFileSync(args.json, JSON.stringify(results, null, 2), "utf8");
    console.log(`\n  wrote sweep results → ${args.json}`);
  }
}

function commandArchetypes(args: Args): void {
  console.log(`\n  ARCHETYPE BASELINES — ${args.seeds} seeds each\n`);
  for (const scenario of ALL_SCENARIOS) {
    const summaries: RunSummary[] = [];
    for (let i = 1; i <= args.seeds; i++) {
      const result = runScenario({
        scenario,
        seed: `s${i}`,
        policy: baselinePolicy,
        policyLabel: "baseline",
        logLevel: "info",
        collectLog: false,
      });
      summaries.push(summariseRun(result));
      if (result.finalViolations.length > 0) {
        console.error(`  ${scenario.id} seed s${i}: invariant violations`);
        process.exitCode = 1;
      }
    }
    const mean = (f: (s: RunSummary) => number): number =>
      summaries.reduce((a, s) => a + f(s), 0) / summaries.length;
    const fails = summaries.filter((s) => s.goalsMetCount < 4).length;
    const observed = new Set(summaries.flatMap((s) => s.failureStatesObserved));

    console.log(`  ${scenario.name}  (${scenario.archetype})`);
    console.log(
      `    served ${mean((s) => s.sessionsCompleted).toFixed(0)}` +
        ` · margin £${mean((s) => s.cumMargin).toFixed(0)}` +
        ` · wait ${(mean((s) => s.cumAvgWaitSeconds) / 60).toFixed(1)} min` +
        ` · trust ${mean((s) => s.trust).toFixed(1)}` +
        ` · util ${mean((s) => s.cumUtilizationPct).toFixed(0)}%` +
        ` · uptime ${mean((s) => s.cumUptimePct).toFixed(1)}%`,
    );
    console.log(
      `    D13 floor ${((fails / summaries.length) * 100).toFixed(0)}%` +
        `${fails / summaries.length >= 0.8 ? " PASS" : " FAIL"}` +
        ` · failure states seen: ${[...observed].join(", ") || "none"}\n`,
    );
  }
}

function commandStrategies(args: Args): void {
  console.log(
    `\n  DOMINANT-STRATEGY TEST (gate criterion 2) — ${args.seeds} seeds per cell\n` +
      `  A strategy that tops every archetype is dominant, and the criterion fails.\n`,
  );

  const scores: StrategyScore[] = [];
  for (const scenario of ALL_SCENARIOS) {
    console.log(`  ${scenario.name} (${scenario.archetype})`);
    console.log(
      `  ${"strategy".padEnd(22)}${"goals".padStart(7)}${"win%".padStart(7)}` +
        `${"margin".padStart(9)}${"served".padStart(8)}${"trust".padStart(7)}${"wait".padStart(7)}`,
    );
    const forScenario = STRATEGIES.map((strategy) => scoreStrategy(strategy, scenario, args.seeds));
    scores.push(...forScenario);
    const best = Math.max(...forScenario.map((s) => s.meanGoalsMet));
    for (const s of forScenario) {
      const mark = s.meanGoalsMet === best ? " ←" : "";
      console.log(
        `  ${s.strategy.padEnd(22)}${s.meanGoalsMet.toFixed(2).padStart(7)}` +
          `${(s.winRate * 100).toFixed(0).padStart(6)}%` +
          `${("£" + s.meanMargin.toFixed(0)).padStart(9)}` +
          `${s.meanSessions.toFixed(0).padStart(8)}` +
          `${s.meanTrust.toFixed(1).padStart(7)}` +
          `${(s.meanWaitSeconds / 60).toFixed(1).padStart(6)}m${mark}`,
      );
    }
    console.log("");
  }

  const verdict = judgeDominance(scores);
  console.log("  WINNER BY SITE — and who is not measurably behind it (D38)");
  for (const w of verdict.winners) {
    const tie = w.tiedWith.length > 1 ? `  [TIED with ${w.tiedWith.slice(1).join(", ")}]` : "";
    console.log(`    ${w.scenarioId.padEnd(22)} ${w.strategy} (${w.meanGoalsMet.toFixed(2)} goals)${tie}`);
    const field = verdict.contenders.find((c) => c.scenarioId === w.scenarioId);
    for (const c of field?.strategies ?? []) {
      const gap = c.behindBy === 0 ? "best" : `-${c.behindBy.toFixed(2)} goals, t=${c.t.toFixed(2)}`;
      console.log(`      contender: ${c.strategy.padEnd(22)} ${gap}`);
    }
  }
  console.log(
    `\n  Distinct argmax winners: ${verdict.distinctWinners.join(", ")}` +
      ` (reporting only — the verdict is separation, not ranking)` +
      `\n  Gate criterion 2: ${verdictLine(verdict)}`,
  );

  if (args.json) {
    writeFileSync(args.json, JSON.stringify({ scores, verdict }, null, 2), "utf8");
    console.log(`\n  wrote strategy scores → ${args.json}`);
  }
}

function commandGate(args: Args): void {
  console.log(`\n  GATE SCORECARD — the machine-measurable half (Plan §6.2)\n`);
  console.log(
    `  Criteria 1 and 5 are deliberately absent. Legibility is scored from the three\n` +
      `  frozen questions asked of external testers, and the one-more-run test is whether\n` +
      `  a tester volunteers a third go. Neither can be measured here, and inventing them\n` +
      `  is exactly what a protocol frozen before the build exists to prevent.\n`,
  );

  console.log("  ── Criterion 2: no dominant strategy ".padEnd(70, "─"));
  const dominance = gatherDominance(args.seeds);
  for (const w of dominance.verdict.winners) {
    const field = dominance.verdict.contenders.find((c) => c.scenarioId === w.scenarioId);
    const others = (field?.strategies ?? []).filter((c) => c.strategy !== w.strategy);
    const tie = w.tiedWith.length > 1 ? ` [TIED]` : "";
    console.log(
      `     ${w.scenarioId.padEnd(22)} won by ${w.strategy} (${w.meanGoalsMet.toFixed(2)} goals)${tie}` +
        (others.length ? `, within noise of ${others.map((c) => c.strategy).join(", ")}` : ", clear of the field"),
    );
  }
  console.log(`     ${verdictLine(dominance.verdict)}\n`);

  console.log("  ── Criterion 3: failure modes reachable ".padEnd(70, "─"));
  const probes = playtestProbes();
  const failures = gatherFailureStates(probes);
  console.log(`     across ${failures.runsInspected} runs (3 scenarios × 3 playtest seeds × 4 plausible approaches)`);
  for (const [state, count] of Object.entries(failures.observed)) {
    console.log(`     ${state.padEnd(20)} ${count > 0 ? `${count} runs` : "not seen"}`);
  }
  console.log(
    `     ${failures.pass ? "PASS" : "FAIL"} — ${failures.distinctObserved.length}/5 observed, needs ≥4\n`,
  );

  console.log("  ── Criterion 4: decisions matter ".padEnd(70, "─"));
  const decisions = gatherDecisionsMatter();
  for (const c of decisions.comparisons.slice(0, 3)) {
    const d = c.comparison.deltas;
    console.log(
      `     ${c.scenarioId.padEnd(22)} margin ${fmtDelta(d["cumMargin"] ?? 0, "£")}` +
        ` · served ${fmtDelta(d["sessionsCompleted"] ?? 0)}` +
        ` · trust ${fmtDelta(d["trust"] ?? 0)}` +
        ` · goals ${fmtDelta(d["goalsMetCount"] ?? 0)}`,
    );
  }
  console.log(`     KPIs moved ≥10% vs baseline: ${decisions.movedKpis.join(", ")}`);
  console.log(`     ${decisions.pass ? "PASS" : "FAIL"} — needs ≥2 goal KPIs moved\n`);

  const machinePass = dominance.verdict.pass && failures.pass && decisions.pass;
  console.log(
    `  Machine-measurable criteria: ${machinePass ? "3/3 PASS" : "NOT ALL PASSING"}.\n` +
      `  Criteria 1 and 5 remain open pending ${PLAYTEST_TESTERS} external testers.`,
  );
}

const PLAYTEST_TESTERS = 3;

/**
 * The one place criterion 2's verdict is put into words (D38).
 *
 * An underpowered run must not print FAIL. Wide error bars make every strategy
 * a contender, so too few seeds drifts toward failure on absence of evidence —
 * which is the safe direction for a gate, but it is a different statement from
 * "this strategy wins everywhere" and gets different words.
 */
function verdictLine(v: DominanceVerdict): string {
  const short = `${v.seeds} seeds is under the ${MIN_SEEDS_FOR_DOMINANCE} this test needs`;
  if (v.pass && !v.underpowered) {
    return `PASS — no strategy is a contender on every archetype (${v.seeds} seeds)`;
  }
  if (v.pass) return `PASS (provisional) — nothing is credible everywhere, but ${short}`;
  if (v.underpowered) {
    return (
      `INCONCLUSIVE — "${v.dominantStrategy}" could not be ruled out anywhere, and ${short}. ` +
      `Absence of evidence, not evidence of dominance — re-run before reading anything into it.`
    );
  }
  return `FAIL — "${v.dominantStrategy}" is credible on every archetype (${v.seeds} seeds)`;
}

function fmtDelta(v: number, unit = ""): string {
  const sign = v > 0 ? "+" : "";
  return `${sign}${unit}${Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)}`;
}

const args = parseArgs(process.argv.slice(2));
switch (args.command) {
  case "batch":
    commandBatch(args);
    break;
  case "trace":
    commandTrace(args);
    break;
  case "sweep":
    commandSweep(args);
    break;
  case "archetypes":
    commandArchetypes(args);
    break;
  case "strategies":
    commandStrategies(args);
    break;
  case "gate":
    commandGate(args);
    break;
  default:
    commandRun(args);
}
