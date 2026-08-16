/**
 * The dominant-strategy test — gate criterion 2.
 *
 *   > Across the three scenario archetypes, no single policy (e.g. "always
 *   > upgrade to fast chargers", "always max price") wins everywhere. At least
 *   > two distinct viable strategies exist.
 *
 * This runs a set of policy *families* — the things a player would actually
 * decide to do, not individual parameter values — against all three archetypes
 * and reports who wins where. A family that tops every site is a dominant
 * strategy and the criterion has failed.
 *
 * Scoring is by goals met, because that is what the game tells the player they
 * are being judged on. Margin is reported alongside as the tiebreak and the
 * sanity check.
 */

import { runScenario } from "../core/run.ts";
import type { ScenarioConfig } from "../core/types.ts";
import { baselinePolicy } from "./baselinePolicy.ts";
import { summariseRun, type RunSummary } from "./compareRuns.ts";

export interface Strategy {
  name: string;
  blurb: string;
  apply: (base: ScenarioConfig) => ScenarioConfig;
}

/**
 * Each strategy is expressed as a starting policy the player could set in the
 * first few seconds and then leave alone. That is deliberately a weaker form of
 * play than a human is capable of — the question here is whether a *standing*
 * policy dominates, which is the form gate criterion 2 actually names.
 */
export const STRATEGIES: Strategy[] = [
  {
    name: "as-shipped",
    blurb: "change nothing",
    apply: (base) => base,
  },
  {
    name: "undercut",
    blurb: "price 20% below the site default",
    apply: (base) => ({ ...base, initialPricePerKwh: round2(base.initialPricePerKwh * 0.8) }),
  },
  {
    name: "premium",
    blurb: "price 15% above the site default",
    apply: (base) => ({ ...base, initialPricePerKwh: round2(base.initialPricePerKwh * 1.15) }),
  },
  {
    name: "preventive",
    blurb: "preventive maintenance, price unchanged",
    apply: (base) => ({ ...base, initialMaintenanceLevel: "preventive" }),
  },
  {
    name: "throughput",
    blurb: "finish-soonest-first + 70% charging limit",
    apply: (base) => ({
      ...base,
      initialPowerPolicy: "queue_relief",
      initialPartialChargeTargetSoc: 0.7,
    }),
  },
  {
    name: "premium+preventive",
    blurb: "charge more, break less",
    apply: (base) => ({
      ...base,
      initialPricePerKwh: round2(base.initialPricePerKwh * 1.15),
      initialMaintenanceLevel: "preventive",
    }),
  },
  {
    name: "throughput+preventive",
    blurb: "move the queue, break less",
    apply: (base) => ({
      ...base,
      initialPowerPolicy: "queue_relief",
      initialPartialChargeTargetSoc: 0.7,
      initialMaintenanceLevel: "preventive",
    }),
  },
];

export interface StrategyScore {
  strategy: string;
  scenarioId: string;
  meanGoalsMet: number;
  winRate: number;
  meanMargin: number;
  meanSessions: number;
  meanTrust: number;
  meanWaitSeconds: number;
}

export function scoreStrategy(
  strategy: Strategy,
  scenario: ScenarioConfig,
  seeds: number,
): StrategyScore {
  const runs: RunSummary[] = [];
  for (let i = 1; i <= seeds; i++) {
    runs.push(
      summariseRun(
        runScenario({
          scenario: strategy.apply(scenario),
          seed: `s${i}`,
          policy: baselinePolicy,
          logLevel: "info",
          collectLog: false,
        }),
      ),
    );
  }
  const mean = (f: (s: RunSummary) => number): number =>
    runs.reduce((a, s) => a + f(s), 0) / runs.length;

  return {
    strategy: strategy.name,
    scenarioId: scenario.id,
    meanGoalsMet: mean((s) => s.goalsMetCount),
    winRate: runs.filter((s) => s.goalsMetCount === 4).length / runs.length,
    meanMargin: mean((s) => s.cumMargin),
    meanSessions: mean((s) => s.sessionsCompleted),
    meanTrust: mean((s) => s.trust),
    meanWaitSeconds: mean((s) => s.cumAvgWaitSeconds),
  };
}

export interface DominanceVerdict {
  /** Best strategy per scenario, by mean goals met. */
  winners: { scenarioId: string; strategy: string; meanGoalsMet: number }[];
  /** A strategy that tops every archetype — the thing criterion 2 forbids. */
  dominantStrategy: string | null;
  /** Distinct strategies that top at least one archetype. */
  distinctWinners: string[];
  pass: boolean;
}

export function judgeDominance(scores: StrategyScore[]): DominanceVerdict {
  const scenarioIds = [...new Set(scores.map((s) => s.scenarioId))];
  const winners = scenarioIds.map((scenarioId) => {
    const forScenario = scores.filter((s) => s.scenarioId === scenarioId);
    const best = forScenario.reduce((a, b) => (b.meanGoalsMet > a.meanGoalsMet ? b : a));
    return { scenarioId, strategy: best.strategy, meanGoalsMet: best.meanGoalsMet };
  });

  const distinctWinners = [...new Set(winners.map((w) => w.strategy))];
  const dominantStrategy = distinctWinners.length === 1 ? (distinctWinners[0] ?? null) : null;

  return {
    winners,
    dominantStrategy,
    distinctWinners,
    // Criterion 2 wants at least two distinct viable strategies across the
    // archetypes, and no single one winning everywhere.
    pass: dominantStrategy === null && distinctWinners.length >= 2,
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
