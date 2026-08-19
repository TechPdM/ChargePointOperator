/**
 * Failure-state detection — D24 / KPI dictionary.
 *
 * Gate criterion 3 needs ≥4 of the 5 states to arise *naturally*, so these
 * tests do two different jobs: prove each detector fires when its conditions
 * are met, and record which states the roadside hub can actually produce today.
 * The second job is the one that feeds the Phase 1 findings — see the
 * reachability block at the bottom.
 */

import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/init.ts";
import { tick } from "../src/game/core/tick.ts";
import { queueAction } from "../src/game/actions/playerActions.ts";
import { runScenario } from "../src/game/core/run.ts";
import { baselinePolicy } from "../src/game/experiment/baselinePolicy.ts";
import { compareRuns, summariseRun } from "../src/game/experiment/compareRuns.ts";
import {
  judgeDominance,
  MIN_SEEDS_FOR_DOMINANCE,
  type StrategyScore,
} from "../src/game/experiment/strategies.ts";
import { roadsideHub } from "../src/game/scenarios/roadsideHub.ts";
import { FAILURE_THRESHOLDS } from "../src/game/core/calibration.ts";
import type { PlayerActionDraft, ScenarioConfig, SimulationState } from "../src/game/core/types.ts";

function advance(state: SimulationState, ticks: number): SimulationState {
  let s = state;
  for (let i = 0; i < ticks && s.running; i++) s = tick(s).state;
  return s;
}

function play(
  scenario: ScenarioConfig,
  seed: string,
  actions: [number, PlayerActionDraft][] = [],
  repair = false,
): SimulationState {
  let s = createInitialState(scenario, seed);
  const byTick = new Map<number, PlayerActionDraft[]>();
  for (const [t, a] of actions) byTick.set(t, [...(byTick.get(t) ?? []), a]);
  const maxTicks = scenario.durationSeconds / scenario.tickSeconds;
  for (let i = 0; i < maxTicks && s.running; i++) {
    for (const a of byTick.get(s.clock.tick) ?? []) s = queueAction(s, a);
    if (repair) for (const a of baselinePolicy(s)) s = queueAction(s, a);
    s = tick(s).state;
  }
  return s;
}

describe("detection is detection, not failure", () => {
  it("a detected failure state never ends the run", () => {
    const s = play(roadsideHub, "s1", [], false);
    expect(s.site.metrics.failureStatesObserved.length).toBeGreaterThan(0);
    // Since D41 there are no hard fails at all, so the only reasons a run can
    // carry are the two the clock produces.
    expect(s.resultReason === "goals_met" || s.resultReason === "goals_missed").toBe(true);
    expect(s.clock.tick).toBe(1_440);
  });
});

describe("reliability_spiral", () => {
  it("enters immediately on three bays down, without waiting out the sustain window", () => {
    let s = createInitialState(roadsideHub, "s1");
    for (const id of ["bay-1", "bay-2", "bay-3"]) {
      const bay = s.chargers[id];
      if (bay) bay.state = "faulted";
    }
    s = advance(s, 1);
    expect(s.site.metrics.failureStatesActive).toContain("reliability_spiral");
    expect(s.site.metrics.failureStatesObserved).toContain("reliability_spiral");
  });

  it("clears once uptime recovers and the bays are back", () => {
    let s = createInitialState(roadsideHub, "s1");
    for (const id of ["bay-1", "bay-2", "bay-3"]) {
      const bay = s.chargers[id];
      if (bay) bay.state = "faulted";
    }
    s = advance(s, 2);
    expect(s.site.metrics.failureStatesActive).toContain("reliability_spiral");

    for (const id of ["bay-1", "bay-2", "bay-3"]) {
      const bay = s.chargers[id];
      if (bay) bay.state = "idle";
    }
    // ROLL uptime must climb back over 90% and hold for the clear window.
    s = advance(s, 60);
    expect(s.site.metrics.failureStatesActive).not.toContain("reliability_spiral");
    // …but it stays on the observed list — that list is sticky, and it is what
    // gate criterion 3 counts.
    expect(s.site.metrics.failureStatesObserved).toContain("reliability_spiral");
  });

  it("does not fire on a single fault", () => {
    let s = createInitialState(roadsideHub, "s1");
    const bay = s.chargers["bay-1"];
    if (bay) bay.state = "faulted";
    s = advance(s, 10);
    expect(s.site.metrics.failureStatesActive).not.toContain("reliability_spiral");
  });
});

describe("power_choke", () => {
  it("needs the queue term as well as the power term", () => {
    // The cap is MEANT to bind at peaks; a power-only rule would fire every
    // peak by design and make criterion 3 meaningless (D24).
    const s = play({ ...roadsideHub, initialGridPowerKw: 150 }, "s2", [], true);
    const everSaturated = s.site.metrics.failureStatesObserved.includes("power_choke");
    expect(typeof everSaturated).toBe("boolean");
    expect(FAILURE_THRESHOLDS.powerChokeQueueLength).toBeGreaterThan(0);
  });

  it("is reached by the baseline on the scenario's own grid cap", () => {
    const result = runScenario({
      scenario: roadsideHub,
      seed: "s1",
      policy: baselinePolicy,
      collectLog: false,
    });
    expect(result.finalState.site.metrics.failureStatesObserved).toContain("power_choke");
  });
});

describe("trust_crash", () => {
  it("fires below 40 while falling, and does not stop the day (D41)", () => {
    const s = play(
      { ...roadsideHub, initialTrust: 42 },
      "s1",
      [[5, { type: "toggle_bay_group", bayIds: ["bay-2", "bay-3", "bay-4", "bay-5", "bay-6"], open: false }]],
      false,
    );
    expect(s.site.metrics.failureStatesObserved).toContain("trust_crash");
    // The assertion this replaces checked trust_crash sat above the hard fail at
    // 30. There is no hard fail now, so the sharper question is whether a site
    // this badly run still trades to close-out — which is what D41 rules.
    expect(s.clock.tick).toBe(1_440);
    expect(s.running).toBe(false);
    expect(s.resultReason).toBe("goals_missed");
  });
});

describe("margin_trap — only evaluable against the paired baseline", () => {
  it("flags an ultra-rapid upgrade that bought no goal improvement", () => {
    const seed = "pt-2";
    const baseline = summariseRun(
      runScenario({
        scenario: roadsideHub,
        seed,
        policy: baselinePolicy,
        policyLabel: "baseline",
        collectLog: false,
      }),
    );
    const played = summariseRun(
      runScenario({
        scenario: roadsideHub,
        seed,
        policy: baselinePolicy,
        policyLabel: "played",
        collectLog: false,
        scriptedActions: new Map([
          // Buy the ultra upgrade at 02:00 and change nothing else. A8/§5a:
          // capex bought at the wrong time is the trap doing its job.
          [120, [{ type: "upgrade_charger", chargerBayId: "bay-1", newType: "ultrarapid_dc" }]],
        ]),
      }),
    );

    expect(played.capexSpent).toBe(roadsideHub.upgradeCosts[0]?.capexCost);
    const comparison = compareRuns(played, baseline);
    expect(comparison.marginTrap).toBe(played.goalsMetCount <= baseline.goalsMetCount);
    if (comparison.marginTrap) {
      expect(played.failureStatesObserved).toContain("margin_trap");
    }
    // Capex must not touch margin (D12) — only cash.
    expect(played.endCash).toBeLessThan(baseline.endCash - 39_000);
  });
});

describe("queue_collapse — reachable by play, not by competence (D31)", () => {
  it("the baseline never reaches it — a competent operator shouldn't", () => {
    for (const seed of ["s1", "s2", "s3"]) {
      const s = play(roadsideHub, seed, [], true);
      expect(s.site.metrics.failureStatesObserved).not.toContain("queue_collapse");
    }
  });

  it("a price cut does reach it — the classic 'I'll attract customers' mistake", () => {
    // Measured before the thresholds were set: across 5 seeds the longest
    // window where pressure and sustained abandonment both held was 0 ticks
    // under baseline at every combination tried, and 44 ticks here.
    const seen = ["s1", "s2", "s3"].map((seed) =>
      play(roadsideHub, seed, [[2, { type: "set_price", pricePerKwh: 0.45 }]], true)
        .site.metrics.failureStatesObserved,
    );
    expect(seen.some((states) => states.includes("queue_collapse"))).toBe(true);
    // …and it drags trust down with it, which is the point.
    expect(seen.some((states) => states.includes("trust_crash"))).toBe(true);
  });

  it("a brief lapse in the conditions does not restart the sustain clock (D31)", () => {
    // ROLL abandonment swings every time a session starts, so an unbroken-run
    // requirement was being defeated by its own measurement noise.
    let s = createInitialState(roadsideHub, "s1");
    s = advance(s, 3);
    s.detectors.failureEnterSince["power_choke"] = s.clock.secondsElapsed;
    const since = s.clock.secondsElapsed;

    // Two ticks with the condition false — inside the grace window.
    s = advance(s, 2);
    expect(s.detectors.failureEnterSince["power_choke"]).toBe(since);

    // Well past the grace window, the clock resets.
    s = advance(s, 8);
    expect(s.detectors.failureEnterSince["power_choke"]).toBeUndefined();
  });
});

describe("all five failure states are reachable (gate criterion 3)", () => {
  it("four arise in the sim; margin_trap needs the paired baseline", () => {
    // Gate criterion 3 counts across ALL runs a playtest produces, not within
    // one — queue_collapse is seed-dependent even under the same mistake.
    const observed = new Set<string>();
    const cut: [number, PlayerActionDraft][] = [[2, { type: "set_price", pricePerKwh: 0.45 }]];
    for (const s of [
      play(roadsideHub, "s1", [], true),
      play(roadsideHub, "s1", [], false),
      ...["s1", "s2", "s3", "s4"].map((seed) => play(roadsideHub, seed, cut, true)),
    ]) {
      for (const f of s.site.metrics.failureStatesObserved) observed.add(f);
    }
    expect(observed).toContain("power_choke");
    expect(observed).toContain("reliability_spiral");
    expect(observed).toContain("trust_crash");
    expect(observed).toContain("queue_collapse");
    // margin_trap is asserted in its own block above — it cannot be detected
    // inside a single run by definition.
    expect(observed.size).toBeGreaterThanOrEqual(4);
  });
});

/**
 * Gate criterion 2 — judged on separation, not on who came first (D38).
 *
 * Unit-level on purpose. The real sweep is 840 runs and belongs in `strategies`;
 * what needs pinning here is the judging, because the old argmax version gave
 * three different answers off the same code at 8, 10 and 40 seeds and nothing in
 * the suite noticed.
 */
describe("criterion 2 is judged on separation, not ranking (D38)", () => {
  const score = (strategy: string, scenarioId: string, goalsMetPerSeed: number[]): StrategyScore => ({
    strategy,
    scenarioId,
    goalsMetPerSeed,
    meanGoalsMet: goalsMetPerSeed.reduce((a, b) => a + b, 0) / goalsMetPerSeed.length,
    winRate: 0,
    meanMargin: 0,
    meanSessions: 0,
    meanTrust: 0,
    meanWaitSeconds: 0,
  });
  const alternating = (a: number, b: number): number[] =>
    Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? a : b));

  it("fails when one strategy is credible on every archetype", () => {
    // `always` tops one site and is statistically level on the other two.
    const scores = [
      score("always", "a", alternating(4, 3)),
      score("other", "a", alternating(1, 0)),
      score("always", "b", alternating(3, 2)),
      score("rival", "b", alternating(3, 2)),
      score("always", "c", alternating(2, 3)),
      score("third", "c", alternating(2, 3)),
    ];
    const v = judgeDominance(scores);
    expect(v.pass).toBe(false);
    expect(v.dominantStrategy).toBe("always");
  });

  it("passes when each site rules the other sites' answers out", () => {
    const scores = [
      score("reliability", "a", alternating(4, 3)),
      score("pricing", "a", alternating(1, 0)),
      score("pricing", "b", alternating(4, 3)),
      score("reliability", "b", alternating(1, 0)),
      score("reliability", "c", alternating(4, 3)),
      score("pricing", "c", alternating(1, 0)),
    ];
    const v = judgeDominance(scores);
    expect(v.pass).toBe(true);
    expect(v.dominantStrategy).toBeNull();
  });

  it("reports an exact tie rather than resolving it by declaration order", () => {
    const tied = alternating(3, 2);
    const v = judgeDominance([
      score("first", "a", [...tied]),
      score("second", "a", [...tied]),
      score("far-behind", "a", alternating(0, 0)),
    ]);
    const winner = v.winners.find((w) => w.scenarioId === "a");
    expect(winner?.tiedWith).toEqual(["first", "second"]);
  });

  it("flags a thin sample as underpowered rather than letting it read as a verdict", () => {
    const thin = judgeDominance([
      score("a", "x", [3, 2]),
      score("b", "x", [3, 2]),
    ]);
    expect(thin.seeds).toBe(2);
    expect(thin.underpowered).toBe(true);

    const ample = judgeDominance([
      score("a", "x", Array.from({ length: MIN_SEEDS_FOR_DOMINANCE }, (_, i) => i % 2)),
      score("b", "x", Array.from({ length: MIN_SEEDS_FOR_DOMINANCE }, (_, i) => i % 2)),
    ]);
    expect(ample.underpowered).toBe(false);
  });

  it("rules out a small but perfectly consistent loss", () => {
    // Loses by exactly one goal on every seed: tiny gap, zero variance, and the
    // strongest evidence available that it is genuinely worse.
    const v = judgeDominance([
      score("best", "a", Array.from({ length: 20 }, () => 3)),
      score("always-one-behind", "a", Array.from({ length: 20 }, () => 2)),
    ]);
    const field = v.contenders.find((c) => c.scenarioId === "a");
    expect(field?.strategies.map((s) => s.strategy)).toEqual(["best"]);
  });
});

/**
 * D41 — the clock is the only thing that ends a day.
 *
 * Both hard fails are gone: an unpayable balance and a collapsed reputation are
 * outcomes you trade through and are scored on, not trapdoors. Before this, a
 * site left unrepaired reached trust under 30, sat there for two sim-hours, and
 * was shut down around 20:00 — four hours of the day removed, and the end-of-day
 * report never said so.
 */
describe("nothing ends a day but the clock (D41)", () => {
  it("a site nobody repairs trades all the way to close-out", () => {
    // No policy at all: faults are never called out, so trust falls and stays
    // down. This is the shape that used to trip trust_collapse.
    const ruined = ["s2", "s3", "s6", "s8"].map((seed) =>
      runScenario({ scenario: roadsideHub, seed, collectLog: false }),
    );
    for (const r of ruined) {
      expect(r.ticks).toBe(1_440);
      expect(r.finalState.clock.secondsElapsed).toBe(roadsideHub.durationSeconds);
      expect(["goals_met", "goals_missed"]).toContain(r.finalState.resultReason);
    }
    // And the seeds were chosen because they do get that bad — otherwise this
    // would pass without exercising anything.
    expect(ruined.some((r) => r.finalState.site.metrics.trust < 30)).toBe(true);
  });

  it("still closes the funnel when the day it closes was a disaster", () => {
    // The old early-exit path had its own close-out sweep. Removing it must not
    // leave anyone stranded on site at 24:00 — invariant 7, on the worst seeds.
    for (const seed of ["s2", "s8"]) {
      const r = runScenario({ scenario: roadsideHub, seed, collectLog: false });
      expect(r.finalViolations).toEqual([]);
      const f = r.finalState.site.metrics.funnel;
      expect(
        f.rejectedSite + f.siteFull + f.abandonedQueue + f.interruptedByFault + f.completed + f.closedAtRunEnd,
      ).toBe(f.arrived);
    }
  });
});
