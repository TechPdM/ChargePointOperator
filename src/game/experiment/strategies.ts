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
import { getActiveWave } from "../core/selectors.ts";
import type { PlayerActionDraft, ScenarioConfig, SimulationState } from "../core/types.ts";
import { baselinePolicy, type PolicyActor } from "./baselinePolicy.ts";
import { summariseRun, type RunSummary } from "./compareRuns.ts";

export interface Strategy {
  name: string;
  blurb: string;
  apply: (base: ScenarioConfig) => ScenarioConfig;
  /**
   * What the strategy does during the day. Absent means the baseline actor:
   * repair on detection and otherwise leave the standing policy alone.
   */
  policy?: PolicyActor;
}

/** Waves this far above the day's mean arrival rate are peaks (D55). */
const PEAK_RATIO = 1.5;
/** …and this far below it are lulls. */
const LULL_RATIO = 0.6;
const PEAK_MARKUP = 1.15;
const LULL_DISCOUNT = 0.9;

function meanArrivalRate(scenario: ScenarioConfig): number {
  let arrivals = 0;
  let seconds = 0;
  for (const w of scenario.demandWaves) {
    const span = w.endSecond - w.startSecond;
    arrivals += w.arrivalRatePerMinute * (span / 60);
    seconds += span;
  }
  return seconds > 0 ? arrivals / (seconds / 60) : 0;
}

/**
 * D55: the first strategy that plays the day rather than setting it up. Price
 * follows the demand wave — 15% over list at the peaks, 10% under in the lulls,
 * list otherwise — and faults are repaired on detection, as the baseline does.
 *
 * It reads only what the dashboard shows a player (the clock, and the wave
 * the scenario timeline names), so a human could do exactly this.
 */
export const wavePricingPolicy: PolicyActor = (state: SimulationState) => {
  const actions: PlayerActionDraft[] = baselinePolicy(state);
  const list = state.scenario.initialPricePerKwh;
  const wave = getActiveWave(state.clock.secondsElapsed, state.scenario.demandWaves);
  const mean = meanArrivalRate(state.scenario);
  let target = list;
  if (wave && mean > 0) {
    const ratio = wave.arrivalRatePerMinute / mean;
    if (ratio >= PEAK_RATIO) target = round2(list * PEAK_MARKUP);
    else if (ratio <= LULL_RATIO) target = round2(list * LULL_DISCOUNT);
  }
  // Pending actions apply next tick, so check those too or this re-sends the
  // same price every tick until it lands.
  const pending = state.pendingActions.some((a) => a.type === "set_price");
  if (!pending && Math.abs(state.site.policy.pricePerKwh - target) > 1e-9) {
    actions.push({ type: "set_price", pricePerKwh: target });
  }
  return actions;
};

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
    // D49: 70% is no longer offered; 75% is the nearest option that is.
    blurb: "finish-soonest-first + 75% charging limit",
    apply: (base) => ({
      ...base,
      initialPowerPolicy: "queue_relief",
      initialPartialChargeTargetSoc: 0.75,
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
      initialPartialChargeTargetSoc: 0.75,
      initialMaintenanceLevel: "preventive",
    }),
  },
  {
    name: "wave-pricing",
    blurb: "price up at the peaks, down in the lulls (D55)",
    apply: (base) => base,
    policy: wavePricingPolicy,
  },
];

export interface StrategyScore {
  strategy: string;
  scenarioId: string;
  meanGoalsMet: number;
  /**
   * Goals met on each seed, in seed order. Kept because the verdict is a
   * *paired* comparison (D38): every strategy plays the same seeds, so the
   * question is whether it loses on the same day, not whether two independent
   * averages differ.
   */
  goalsMetPerSeed: number[];
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
          policy: strategy.policy ?? baselinePolicy,
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
    goalsMetPerSeed: runs.map((s) => s.goalsMetCount),
    // D55 fix: was `=== 4`, which no run could reach once D44 left three goals.
    winRate:
      runs.filter((s) => s.goalsMetCount === Object.keys(scenario.goals).length).length /
      runs.length,
    meanMargin: mean((s) => s.cumMargin),
    meanSessions: mean((s) => s.sessionsCompleted),
    meanTrust: mean((s) => s.trust),
    meanWaitSeconds: mean((s) => s.cumAvgWaitSeconds),
  };
}

/** How many standard errors below the best a strategy must sit to be ruled out. */
const CONTENDER_T = 2;

/**
 * Seeds below which this test cannot be trusted to *pass or fail* (D38).
 *
 * Measured, not chosen: at 8 seeds `premium+preventive` is inside the error bars
 * on all three archetypes and the criterion fails; at 40 the corridor rules it
 * out outright and the criterion passes. The failure at 8 is an absence of
 * evidence, not evidence of dominance, and the two must not print the same word.
 */
export const MIN_SEEDS_FOR_DOMINANCE = 40;

export interface Contender {
  strategy: string;
  meanGoalsMet: number;
  /** Paired mean difference from the site's best. 0 for the best itself. */
  behindBy: number;
  /** `behindBy` in standard errors. `Infinity` when it loses on every seed. */
  t: number;
}

export interface DominanceVerdict {
  /** Best strategy per scenario, by mean goals met. */
  winners: {
    scenarioId: string;
    strategy: string;
    meanGoalsMet: number;
    /** Every strategy sharing the top mean exactly. Length > 1 is a real tie. */
    tiedWith: string[];
  }[];
  /**
   * Per scenario, every strategy not measurably worse than the best — the set
   * the site's answer could credibly be drawn from.
   */
  contenders: { scenarioId: string; strategies: Contender[] }[];
  /**
   * A strategy that is a contender on **every** archetype — the thing criterion
   * 2 forbids. Null when no single answer is credible everywhere.
   */
  dominantStrategy: string | null;
  /** Distinct strategies that top at least one archetype. Reporting only (D38). */
  distinctWinners: string[];
  /** Seeds each cell was scored over. */
  seeds: number;
  /**
   * Too few seeds for the verdict to mean anything either way. Wide error bars
   * make everything a contender, so an underpowered run drifts toward FAIL —
   * the safe direction, but "not shown" is not the same as "dominant".
   */
  underpowered: boolean;
  pass: boolean;
}

/**
 * Judge criterion 2 on **separation**, not on who came first (D38).
 *
 * The old test counted distinct argmax winners. That is unstable when the top
 * two are close: the same code answered "three winners", then "two sharing a
 * component", then "two genuinely distinct" across 8, 10 and 40 seeds, because
 * an argmax over a 0.1-goal gap reshuffles with the sample. It also broke ties
 * by `STRATEGIES` declaration order and said nothing about having done so.
 *
 * What the criterion actually forbids is one answer being credible everywhere.
 * So for each site we take the best and keep every strategy that is not
 * measurably worse than it — a paired comparison over the shared seeds, which
 * is the right test because every strategy plays the same days. A strategy that
 * survives that on all three archetypes is dominant. Nothing else is.
 *
 * This is a stricter reading than the old one, not a looser one: it passed on
 * every dataset the old test passed on, and it stops depending on which of two
 * statistically indistinguishable strategies happened to come first.
 */
export function judgeDominance(scores: StrategyScore[]): DominanceVerdict {
  const scenarioIds = [...new Set(scores.map((s) => s.scenarioId))];

  const winners: DominanceVerdict["winners"] = [];
  const contenders: DominanceVerdict["contenders"] = [];

  for (const scenarioId of scenarioIds) {
    const forScenario = scores.filter((s) => s.scenarioId === scenarioId);
    const topMean = Math.max(...forScenario.map((s) => s.meanGoalsMet));
    const tied = forScenario.filter((s) => s.meanGoalsMet === topMean);
    // Still declaration order when the means are exactly equal, but now the tie
    // is reported rather than silently resolved.
    const best = tied[0];
    if (!best) continue;

    winners.push({
      scenarioId,
      strategy: best.strategy,
      meanGoalsMet: best.meanGoalsMet,
      tiedWith: tied.map((s) => s.strategy),
    });

    contenders.push({
      scenarioId,
      strategies: forScenario
        .map((s) => {
          const { mean, t } = pairedGap(best.goalsMetPerSeed, s.goalsMetPerSeed);
          return { strategy: s.strategy, meanGoalsMet: s.meanGoalsMet, behindBy: mean, t };
        })
        .filter((c) => c.t < CONTENDER_T)
        .sort((a, b) => a.behindBy - b.behindBy),
    });
  }

  const everywhere = contenders.length
    ? contenders
        .map((c) => new Set(c.strategies.map((s) => s.strategy)))
        .reduce((a, b) => new Set([...a].filter((x) => b.has(x))))
    : new Set<string>();

  const distinctWinners = [...new Set(winners.map((w) => w.strategy))];
  const dominantStrategy = everywhere.size > 0 ? ([...everywhere].sort()[0] ?? null) : null;
  const seeds = Math.min(...scores.map((s) => s.goalsMetPerSeed.length));

  return {
    winners,
    contenders,
    dominantStrategy,
    distinctWinners,
    seeds: Number.isFinite(seeds) ? seeds : 0,
    underpowered: seeds < MIN_SEEDS_FOR_DOMINANCE,
    pass: dominantStrategy === null,
  };
}

/**
 * Paired difference between the best strategy and one other, over the seeds
 * they share. Returns the mean gap and its size in standard errors.
 *
 * Degenerate cases are the ones that matter here. A strategy that never differs
 * from the best is a contender (`t` 0); one that loses by the same amount on
 * every single seed has zero variance and is ruled out (`t` Infinity) — which
 * is correct, since a consistent loss is the strongest evidence there is.
 */
function pairedGap(best: number[], other: number[]): { mean: number; t: number } {
  const d: number[] = [];
  for (let i = 0; i < Math.min(best.length, other.length); i++) {
    d.push((best[i] ?? 0) - (other[i] ?? 0));
  }
  if (d.length === 0) return { mean: 0, t: 0 };
  const mean = d.reduce((a, b) => a + b, 0) / d.length;
  if (d.length < 2) return { mean, t: mean === 0 ? 0 : Number.POSITIVE_INFINITY };

  const variance = d.reduce((a, b) => a + (b - mean) ** 2, 0) / (d.length - 1);
  const se = Math.sqrt(variance / d.length);
  if (se === 0) return { mean, t: mean === 0 ? 0 : Number.POSITIVE_INFINITY };
  return { mean: round2(mean), t: Math.abs(mean / se) };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
