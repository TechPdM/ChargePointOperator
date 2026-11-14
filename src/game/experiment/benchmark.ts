/**
 * Find the good player's best settings for a site, then measure them honestly.
 *
 * Two separate sets of days, on purpose. The search tunes on `t1…tN`; the
 * reported win rate comes from `v1…vM`, days the search never saw. Tuning and
 * scoring on the same days would flatter the result: with a handful of
 * settings to choose from, something always looks lucky.
 *
 * The search is coordinate descent: start from the defaults, try every value of
 * one setting with the rest held, keep the best, move to the next setting, and
 * repeat until a full pass changes nothing. It is not guaranteed to find the
 * global best, so the benchmark is a floor on what good play can do, not a
 * ceiling. That is the safe direction for a "can it be won?" check.
 */

import { runScenario } from "../core/run.ts";
import type { ScenarioConfig, ScenarioGoals } from "../core/types.ts";
import { baselinePolicy, type PolicyActor } from "./baselinePolicy.ts";
import { summariseRun, type RunSummary } from "./compareRuns.ts";
import {
  DEFAULT_GOOD_PLAYER,
  describeSettings,
  goodPlayerPolicy,
  type GoodPlayerSettings,
} from "./goodPlayer.ts";

export interface SeedSetScore {
  winRate: number;
  meanGoalsMet: number;
  goalRates: Record<keyof ScenarioGoals, number>;
  meanMargin: number;
  meanWaitSeconds: number;
  meanTrust: number;
  goalsMetPerSeed: number[];
}

/** The axes the search walks, and the values it tries on each. */
export const SEARCH_AXES: { [K in keyof GoodPlayerSettings]: GoodPlayerSettings[K][] } = {
  maintenance: ["reactive", "standard", "preventive"],
  priceMultiplier: [0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3],
  waveSwing: [0, 0.05, 0.1, 0.15],
  queueMarkup: [0, 0.05, 0.1, 0.2],
  peakChargeLimit: [undefined, 0.9, 0.75],
  queueWaitSeconds: [120, 180, 300, 480],
  powerPolicy: ["equal_share", "queue_relief", "fast_first"],
  callOutOnContract: [false, true],
};

export function seedList(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}${i + 1}`);
}

export function scorePolicy(
  scenario: ScenarioConfig,
  policy: PolicyActor,
  seeds: string[],
): SeedSetScore {
  const runs: RunSummary[] = seeds.map((seed) =>
    summariseRun(
      runScenario({
        scenario,
        seed,
        policy,
        logLevel: "info",
        collectLog: false,
        invariants: "off",
      }),
    ),
  );
  const n = runs.length;
  const mean = (f: (s: RunSummary) => number): number => runs.reduce((a, s) => a + f(s), 0) / n;
  const goalKeys = Object.keys(scenario.goals) as (keyof ScenarioGoals)[];
  const goalRates = Object.fromEntries(
    goalKeys.map((k) => [k, runs.filter((s) => s.goalsMet[k]).length / n]),
  ) as Record<keyof ScenarioGoals, number>;
  return {
    winRate: runs.filter((s) => s.goalsMetCount === goalKeys.length).length / n,
    meanGoalsMet: mean((s) => s.goalsMetCount),
    goalRates,
    meanMargin: mean((s) => s.cumMargin),
    meanWaitSeconds: mean((s) => s.cumAvgWaitSeconds),
    meanTrust: mean((s) => s.trust),
    goalsMetPerSeed: runs.map((s) => s.goalsMetCount),
  };
}

/** Wins first; goals met breaks ties, since win rate moves in coarse steps. */
function objective(s: SeedSetScore): number {
  return s.winRate + 0.1 * s.meanGoalsMet;
}

export interface SearchStep {
  settings: GoodPlayerSettings;
  label: string;
  score: SeedSetScore;
}

export interface BenchmarkResult {
  scenarioId: string;
  scenarioName: string;
  tuningSeeds: number;
  validationSeeds: number;
  best: GoodPlayerSettings;
  bestLabel: string;
  /** The best settings on the tuning days — optimistic by construction. */
  tuning: SeedSetScore;
  /** The best settings on fresh days — the number to quote. */
  validation: SeedSetScore;
  /** The D22 baseline on the same fresh days. */
  baseline: SeedSetScore;
  configsTried: number;
  passes: number;
}

export function runBenchmark(
  scenario: ScenarioConfig,
  options: {
    tuningSeeds: number;
    validationSeeds: number;
    maxPasses?: number;
    onProgress?: (line: string) => void;
  },
): BenchmarkResult {
  const tuning = seedList("t", options.tuningSeeds);
  const validation = seedList("v", options.validationSeeds);
  const log = options.onProgress ?? (() => {});
  const cache = new Map<string, SearchStep>();

  const evaluate = (settings: GoodPlayerSettings): SearchStep => {
    const key = JSON.stringify(settings);
    const hit = cache.get(key);
    if (hit) return hit;
    const step = {
      settings,
      label: describeSettings(settings),
      score: scorePolicy(scenario, goodPlayerPolicy(settings), tuning),
    };
    cache.set(key, step);
    return step;
  };

  let best = evaluate(DEFAULT_GOOD_PLAYER);
  log(`start  ${fmt(best.score)}  ${best.label}`);
  let passes = 0;
  for (let pass = 1; pass <= (options.maxPasses ?? 4); pass++) {
    passes = pass;
    const before = JSON.stringify(best.settings);
    for (const axis of Object.keys(SEARCH_AXES) as (keyof GoodPlayerSettings)[]) {
      for (const value of SEARCH_AXES[axis]) {
        const candidate = evaluate({ ...best.settings, [axis]: value });
        if (objective(candidate.score) > objective(best.score) + 1e-9) {
          best = candidate;
          log(`pass ${pass} ${axis.padEnd(18)} ${fmt(best.score)}  ${best.label}`);
        }
      }
    }
    if (JSON.stringify(best.settings) === before) break;
  }

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    tuningSeeds: tuning.length,
    validationSeeds: validation.length,
    best: best.settings,
    bestLabel: best.label,
    tuning: best.score,
    validation: scorePolicy(scenario, goodPlayerPolicy(best.settings), validation),
    baseline: scorePolicy(scenario, baselinePolicy, validation),
    configsTried: cache.size,
    passes,
  };
}

function fmt(s: SeedSetScore): string {
  return `win ${pct(s.winRate).padStart(4)} goals ${s.meanGoalsMet.toFixed(2)}`;
}

export function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}
