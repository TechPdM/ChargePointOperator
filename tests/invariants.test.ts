/**
 * The nine invariants, across a batch of seeds — Architecture §9.1.
 *
 * `runScenario` checks invariants 1–7 every tick with mode "throw", so a clean
 * run IS the assertion. Invariant 7's exact funnel closure is checked after the
 * D18 close-out sweep, and invariant 8 is a schema test with no run at all.
 */

import { describe, expect, it } from "vitest";
import { runScenario } from "../src/game/core/run.ts";
import { createInitialState } from "../src/game/core/init.ts";
import { tick } from "../src/game/core/tick.ts";
import { queueAction } from "../src/game/actions/playerActions.ts";
import { baselinePolicy } from "../src/game/experiment/baselinePolicy.ts";
import { roadsideHub } from "../src/game/scenarios/roadsideHub.ts";
import { ACTION_EVENT_MAP, MVP_EVENT_CUT, type LogEventName } from "../src/game/logging/schema.ts";
import type {
  PlayerActionDraft,
  PlayerActionType,
  ScenarioConfig,
} from "../src/game/core/types.ts";

const SEEDS = ["s1", "s2", "s3", "s4", "s5", "pt-1", "pt-2", "pt-3"];

describe("invariants 1–7 hold across a seed batch", () => {
  for (const seed of SEEDS) {
    it(`seed ${seed}`, () => {
      const result = runScenario({
        scenario: roadsideHub,
        seed,
        policy: baselinePolicy,
        invariants: "throw",
        collectLog: false,
      });
      expect(result.finalViolations).toEqual([]);
      expect(result.finalState.running).toBe(false);
      expect(result.ticks).toBe(1_440);
    });
  }
});

describe("invariant 7 — the funnel is an accounting identity", () => {
  it("every vehicle lands in exactly one bucket after close-out", () => {
    const { finalState } = runScenario({
      scenario: roadsideHub,
      seed: "s2",
      policy: baselinePolicy,
      collectLog: false,
    });
    const f = finalState.site.metrics.funnel;
    const bucketed =
      f.rejectedSite + f.siteFull + f.abandonedQueue + f.interruptedByFault + f.completed + f.closedAtRunEnd;
    expect(bucketed).toBe(f.arrived);
    expect(f.arrived).toBeGreaterThan(50);

    const vehicles = Object.values(finalState.vehicles);
    expect(vehicles.length).toBe(f.arrived);
    for (const v of vehicles) {
      expect(["left", "complete"]).toContain(v.state);
      expect(v.leaveReason).toBeDefined();
    }
  });
});

describe("invariant 8 — action union and event catalogue are a matched pair", () => {
  const actionTypes: PlayerActionType[] = [
    "set_price",
    "set_power_policy",
    "toggle_bay_group",
    "schedule_repair",
    "set_maintenance_level",
    "upgrade_charger",
    "set_partial_charge_target",
  ];

  it("every action type has exactly one decision-marker event", () => {
    expect(Object.keys(ACTION_EVENT_MAP).sort()).toEqual([...actionTypes].sort());
    const events = Object.values(ACTION_EVENT_MAP);
    expect(new Set(events).size).toBe(events.length);
  });

  it("every decision-marker event is in the MVP catalogue cut", () => {
    for (const event of Object.values(ACTION_EVENT_MAP)) {
      expect(MVP_EVENT_CUT).toContain(event);
    }
  });

  it("each applied action emits its marker exactly once, carrying the action id", () => {
    const drafts: PlayerActionDraft[] = [
      { type: "set_price", pricePerKwh: 0.89 },
      { type: "set_power_policy", powerPolicy: "fast_first" },
      { type: "toggle_bay_group", bayIds: ["bay-3"], open: false },
      { type: "set_maintenance_level", level: "preventive" },
      { type: "upgrade_charger", chargerBayId: "bay-1", newType: "ultrarapid_dc" },
      { type: "set_partial_charge_target", targetSoc: 0.8 },
    ];

    let state = createInitialState(roadsideHub, "s1");
    for (const draft of drafts) state = queueAction(state, draft);
    // A repair needs something to repair: fault a bay by hand first.
    const bay = state.chargers["bay-4"];
    if (bay) bay.state = "faulted";
    state = queueAction(state, { type: "schedule_repair", chargerBayId: "bay-4" });

    const ids = state.pendingActions.map((a) => ({ id: a.id, type: a.type }));
    const { events } = tick(state);

    for (const { id, type } of ids) {
      const expected: LogEventName = ACTION_EVENT_MAP[type];
      const matches = events.filter((e) => e.data?.["action_id"] === id);
      expect(matches.length, `${type} should emit exactly one marker`).toBe(1);
      expect(matches[0]?.event_name).toBe(expected);
    }
  });

  it("emits no event name outside the declared catalogue", () => {
    const result = runScenario({
      scenario: roadsideHub,
      seed: "s1",
      policy: baselinePolicy,
    });
    const names = new Set(result.logger.getEvents().map((e) => e.event_name));
    for (const name of names) expect(MVP_EVENT_CUT).toContain(name);
  });
});

describe("invariant 2 — the grid cap is never exceeded, even under a hostile policy", () => {
  it("manual allocations asking for more than the cap are scaled down", () => {
    let state = createInitialState(roadsideHub, "s1");
    state = queueAction(state, {
      type: "set_power_policy",
      powerPolicy: "manual",
      manualAllocationsKw: {
        "bay-1": 500,
        "bay-2": 500,
        "bay-3": 500,
        "bay-4": 500,
        "bay-5": 500,
        "bay-6": 500,
      },
    });
    for (let i = 0; i < 400; i++) state = tick(state).state;
    const allocated = Object.values(state.chargers).reduce((a, b) => a + b.allocatedPowerKw, 0);
    expect(allocated).toBeLessThanOrEqual(roadsideHub.initialGridPowerKw + 1e-6);
  });

  it("a tighter grid cap binds without breaking anything", () => {
    // 300 kW against 1,300 kW of nameplate. Re-scaled with the 2026-08-17
    // hardware re-rating; 120 kW is now less than one bay's ceiling, which
    // tests the degenerate case rather than a tight one.
    const squeezed: ScenarioConfig = { ...roadsideHub, initialGridPowerKw: 300 };
    const result = runScenario({
      scenario: squeezed,
      seed: "s1",
      policy: baselinePolicy,
      collectLog: false,
    });
    expect(result.finalViolations).toEqual([]);
    expect(result.finalState.site.metrics.sessionsCompleted).toBeGreaterThan(0);
  });
});
