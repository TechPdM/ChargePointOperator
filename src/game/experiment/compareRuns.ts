/**
 * Run summaries and played-vs-baseline comparison — O4.
 *
 * This is also where `margin_trap` is decided. Its definition (KPI dictionary)
 * is "capex > 0 AND goals-met count ≤ the same-seed baseline's", which needs
 * the paired baseline run — so it cannot be detected inside a single sim, and
 * that is one more reason the baseline harness is MVP-core (D6) rather than a
 * Phase 3 nicety.
 */

import { cumulativeMargin } from "../systems/economics.ts";
import { evaluateGoals } from "../systems/scoring.ts";
import type { RunResult } from "../core/run.ts";
import type { FailureState, ScenarioGoals, SimulationState } from "../core/types.ts";

export interface RunSummary {
  runId: string;
  seed: string;
  policyLabel: string;
  outcome: string;
  sessionsCompleted: number;
  cumMargin: number;
  cumAvgWaitSeconds: number;
  trust: number;
  cumUptimePct: number;
  cumUtilizationPct: number;
  cumAbandonmentRatePct: number;
  sessionSuccessRatePct: number;
  chargeStartSuccessRatePct: number;
  kwhDelivered: number;
  endCash: number;
  capexSpent: number;
  faults: number;
  arrivals: number;
  rejectedSite: number;
  siteFull: number;
  goalsMet: Record<keyof ScenarioGoals, boolean>;
  goalsMetCount: number;
  failureStatesObserved: FailureState[];
  finalStateHash: string;
  trustClampHits: number;
}

export function summariseState(state: SimulationState, meta: {
  runId: string;
  seed: string;
  policyLabel: string;
  outcome: string;
  finalStateHash: string;
  faults: number;
}): RunSummary {
  const m = state.site.metrics;
  const outcome = evaluateGoals(state);
  const openDenominator = Math.max(1e-9, m.openBaySeconds);
  const cumUptime =
    1 - (m.downtimeFaultSeconds + m.downtimeRepairSeconds) / openDenominator;
  const availableBaySeconds = Math.max(
    1e-9,
    m.openBaySeconds - m.downtimeFaultSeconds - m.downtimeRepairSeconds,
  );
  const f = m.funnel;

  const goalsMet = outcome.goalsMet;
  return {
    runId: meta.runId,
    seed: meta.seed,
    policyLabel: meta.policyLabel,
    outcome: meta.outcome,
    sessionsCompleted: m.sessionsCompleted,
    cumMargin: round2(cumulativeMargin(state)),
    cumAvgWaitSeconds: round2(outcome.cumAvgWaitSeconds),
    trust: round2(m.trust),
    cumUptimePct: round2(cumUptime * 100),
    cumUtilizationPct: round2((m.occupiedBaySeconds / availableBaySeconds) * 100),
    cumAbandonmentRatePct: round2(
      (f.abandonedQueue / Math.max(1, f.abandonedQueue + f.sessionsStarted)) * 100,
    ),
    sessionSuccessRatePct: m.sessionSuccessRatePct,
    chargeStartSuccessRatePct: m.chargeStartSuccessRatePct,
    kwhDelivered: round2(m.kwhDelivered),
    endCash: round2(state.site.economics.cash),
    capexSpent: round2(state.site.economics.capexSpentToday),
    faults: meta.faults,
    arrivals: f.arrived,
    rejectedSite: f.rejectedSite,
    siteFull: f.siteFull,
    goalsMet,
    goalsMetCount: Object.values(goalsMet).filter(Boolean).length,
    failureStatesObserved: [...m.failureStatesObserved],
    finalStateHash: meta.finalStateHash,
    trustClampHits: m.trustClampHits,
  };
}

export function summariseRun(result: RunResult): RunSummary {
  const faults = result.logger
    .getEvents()
    .filter((e) => e.event_name === "charger.fault_detected").length;
  return summariseState(result.finalState, {
    runId: result.manifest.run_id,
    seed: result.manifest.seed,
    policyLabel: result.manifest.policy_label ?? "played",
    outcome: result.manifest.outcome ?? "aborted",
    finalStateHash: result.finalStateHash,
    faults,
  });
}

export interface Comparison {
  seed: string;
  played: RunSummary;
  baseline: RunSummary;
  deltas: Record<string, number>;
  /** Capex spent that bought no goal improvement over the same-seed baseline. */
  marginTrap: boolean;
}

export function compareRuns(played: RunSummary, baseline: RunSummary): Comparison {
  const deltas: Record<string, number> = {
    sessionsCompleted: played.sessionsCompleted - baseline.sessionsCompleted,
    cumMargin: round2(played.cumMargin - baseline.cumMargin),
    cumAvgWaitSeconds: round2(played.cumAvgWaitSeconds - baseline.cumAvgWaitSeconds),
    trust: round2(played.trust - baseline.trust),
    cumUptimePct: round2(played.cumUptimePct - baseline.cumUptimePct),
    cumAbandonmentRatePct: round2(
      played.cumAbandonmentRatePct - baseline.cumAbandonmentRatePct,
    ),
    kwhDelivered: round2(played.kwhDelivered - baseline.kwhDelivered),
    goalsMetCount: played.goalsMetCount - baseline.goalsMetCount,
  };

  const marginTrap = played.capexSpent > 0 && played.goalsMetCount <= baseline.goalsMetCount;
  if (marginTrap && !played.failureStatesObserved.includes("margin_trap")) {
    played.failureStatesObserved.push("margin_trap");
  }

  return { seed: played.seed, played, baseline, deltas, marginTrap };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// --- batch statistics -------------------------------------------------------

export interface Stat {
  mean: number;
  p10: number;
  p50: number;
  p90: number;
  min: number;
  max: number;
}

export function stat(values: number[]): Stat {
  if (values.length === 0) {
    return { mean: 0, p10: 0, p50: 0, p90: 0, min: 0, max: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return {
    mean: round2(mean),
    p10: round2(percentile(sorted, 0.1)),
    p50: round2(percentile(sorted, 0.5)),
    p90: round2(percentile(sorted, 0.9)),
    min: round2(sorted[0] ?? 0),
    max: round2(sorted[sorted.length - 1] ?? 0),
  };
}

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 1) return sorted[0] ?? 0;
  const pos = (sorted.length - 1) * q;
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  const lo = sorted[lower] ?? 0;
  const hi = sorted[upper] ?? 0;
  return lo + (hi - lo) * (pos - lower);
}
