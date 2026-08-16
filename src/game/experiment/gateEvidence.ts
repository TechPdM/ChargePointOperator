/**
 * Gate evidence — Plan §6.2, Playtest protocol §5.
 *
 * Three of the five gate criteria can be measured without a human in the room.
 * Two cannot, and this file does not pretend otherwise:
 *
 *   - **Criterion 1 (legibility)** is scored from the three frozen questions
 *     asked of external testers, against the logs. No harness can answer it.
 *   - **Criterion 5 (one-more-run)** is whether a tester *volunteers* a third
 *     run. That is the measurement.
 *
 * What this does compute is criterion 3 (a count over run manifests, per D24),
 * criterion 4 (played-vs-baseline on the same seeds, per O4), and the input to
 * criterion 2 (the archetype strategy spread from `strategies.ts`). Those three
 * are evidence a playtest session should not have to generate.
 */

import { runScenario } from "../core/run.ts";
import { ALL_SCENARIOS } from "../scenarios/index.ts";
import type { FailureState, PlayerActionDraft, ScenarioConfig } from "../core/types.ts";
import { baselinePolicy } from "./baselinePolicy.ts";
import { compareRuns, summariseRun, type Comparison } from "./compareRuns.ts";
import { judgeDominance, scoreStrategy, STRATEGIES } from "./strategies.ts";

/** The seeds every Phase 4 tester plays, in this order (protocol §1). */
export const PLAYTEST_SEEDS = ["pt-1", "pt-2", "pt-3"] as const;

const ALL_FAILURE_STATES: FailureState[] = [
  "queue_collapse",
  "power_choke",
  "reliability_spiral",
  "margin_trap",
  "trust_crash",
];

// ---------------------------------------------------------------------------
// Criterion 3 — failure modes reachable
// ---------------------------------------------------------------------------

export interface FailureStateEvidence {
  observed: Record<FailureState, number>;
  distinctObserved: FailureState[];
  runsInspected: number;
  pass: boolean;
}

/**
 * Plausible ways a player gets into trouble. Criterion 3 asks for failure
 * states arising "naturally in playtests, not just in contrived setups", so
 * these are all things a person would actually *choose* — not states forced by
 * poking the sim.
 */
export interface ProbeRun {
  label: string;
  scenario: ScenarioConfig;
  seed: string;
  actions: [number, PlayerActionDraft][];
  /** Whether the run repairs faults; a player who ignores them is a real case. */
  repairs: boolean;
}

export function playtestProbes(): ProbeRun[] {
  const probes: ProbeRun[] = [];
  for (const scenario of ALL_SCENARIOS) {
    for (const seed of PLAYTEST_SEEDS) {
      probes.push({ label: "played straight", scenario, seed, actions: [], repairs: true });
      probes.push({
        label: "ignores the faults",
        scenario,
        seed,
        actions: [],
        repairs: false,
      });
      probes.push({
        label: "cuts the price to attract customers",
        scenario,
        seed,
        actions: [[2, { type: "set_price", pricePerKwh: scenario.initialPricePerKwh * 0.6 }]],
        repairs: true,
      });
      probes.push({
        label: "buys the upgrade early",
        scenario,
        seed,
        actions: [
          [
            60,
            {
              type: "upgrade_charger",
              chargerBayId: scenario.bays[0]?.id ?? "bay-1",
              newType: scenario.upgradeCosts[0]?.to ?? "ultrarapid_dc",
            },
          ],
        ],
        repairs: true,
      });
    }
  }
  return probes;
}

export function gatherFailureStates(probes: ProbeRun[]): FailureStateEvidence {
  const observed = Object.fromEntries(ALL_FAILURE_STATES.map((f) => [f, 0])) as Record<
    FailureState,
    number
  >;

  for (const probe of probes) {
    const scriptedActions = new Map<number, PlayerActionDraft[]>();
    for (const [tick, action] of probe.actions) {
      scriptedActions.set(tick, [...(scriptedActions.get(tick) ?? []), action]);
    }
    const result = runScenario({
      scenario: probe.scenario,
      seed: probe.seed,
      policy: probe.repairs ? baselinePolicy : undefined,
      policyLabel: "tester-run",
      scriptedActions,
      logLevel: "info",
      collectLog: false,
    });

    const played = summariseRun(result);
    // margin_trap is only decidable against the paired baseline (KPI dict).
    if (played.capexSpent > 0) {
      compareRuns(played, summariseRun(
        runScenario({
          scenario: probe.scenario,
          seed: probe.seed,
          policy: baselinePolicy,
          logLevel: "info",
          collectLog: false,
        }),
      ));
    }
    for (const state of played.failureStatesObserved) observed[state] += 1;
  }

  const distinctObserved = ALL_FAILURE_STATES.filter((f) => observed[f] > 0);
  return {
    observed,
    distinctObserved,
    runsInspected: probes.length,
    pass: distinctObserved.length >= 4,
  };
}

// ---------------------------------------------------------------------------
// Criterion 4 — decisions matter
// ---------------------------------------------------------------------------

export interface DecisionsMatterEvidence {
  comparisons: { label: string; scenarioId: string; comparison: Comparison }[];
  /** Goal KPIs on which a deliberate strategy moved the needle vs baseline. */
  movedKpis: string[];
  pass: boolean;
}

/**
 * Criterion 4 asks that played runs "differ meaningfully from the fixed-policy
 * baseline on the same seed". Meaningful is defined here as ≥10% on a goal KPI,
 * which is well outside seed noise for these distributions.
 */
export function gatherDecisionsMatter(): DecisionsMatterEvidence {
  const comparisons: DecisionsMatterEvidence["comparisons"] = [];
  const moved = new Set<string>();

  for (const scenario of ALL_SCENARIOS) {
    for (const seed of PLAYTEST_SEEDS) {
      const baseline = summariseRun(
        runScenario({ scenario, seed, policy: baselinePolicy, logLevel: "info", collectLog: false }),
      );
      // A deliberate, legible strategy — the kind a tester actually adopts.
      const played = summariseRun(
        runScenario({
          scenario: {
            ...scenario,
            initialPricePerKwh: round2(scenario.initialPricePerKwh * 1.15),
            initialMaintenanceLevel: "preventive",
          },
          seed,
          policy: baselinePolicy,
          policyLabel: "tester-run",
          logLevel: "info",
          collectLog: false,
        }),
      );
      const comparison = compareRuns(played, baseline);
      comparisons.push({ label: "premium + preventive", scenarioId: scenario.id, comparison });

      for (const [kpi, delta] of Object.entries(comparison.deltas)) {
        const base = Math.abs(
          (baseline as unknown as Record<string, number>)[kpi] ?? 0,
        );
        if (base > 0 && Math.abs(delta) / base >= 0.1) moved.add(kpi);
      }
    }
  }

  return {
    comparisons,
    movedKpis: [...moved],
    pass: moved.size >= 2,
  };
}

// ---------------------------------------------------------------------------
// Criterion 2 — no dominant strategy
// ---------------------------------------------------------------------------

export function gatherDominance(seeds: number) {
  const scores = ALL_SCENARIOS.flatMap((scenario) =>
    STRATEGIES.map((strategy) => scoreStrategy(strategy, scenario, seeds)),
  );
  return { scores, verdict: judgeDominance(scores) };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
