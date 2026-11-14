/**
 * The good-player benchmark (strategy analysis §5, item 3). These pin what the
 * scripted player does with the controls, not how well it scores: the score is
 * the benchmark's output, measured by `npm run sim -- bench`.
 */

import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/init.ts";
import { runScenario } from "../src/game/core/run.ts";
import {
  DEFAULT_GOOD_PLAYER,
  describeSettings,
  goodPlayerPolicy,
} from "../src/game/experiment/goodPlayer.ts";
import { destinationSite, roadsideHub } from "../src/game/scenarios/index.ts";

describe("good player", () => {
  it("takes its contract and sets its price in the first minute", () => {
    const state = createInitialState(roadsideHub, "s1");
    const actions = goodPlayerPolicy({
      ...DEFAULT_GOOD_PLAYER,
      maintenance: "preventive",
      priceMultiplier: 1.1,
    })(state);
    expect(actions).toContainEqual({ type: "set_maintenance_level", level: "preventive" });
    expect(actions).toContainEqual({ type: "set_price", pricePerKwh: 0.87 });
  });

  it("asks for nothing once its standing settings are in place", () => {
    const state = createInitialState(roadsideHub, "s1");
    state.site.policy.maintenanceLevel = DEFAULT_GOOD_PLAYER.maintenance;
    expect(goodPlayerPolicy(DEFAULT_GOOD_PLAYER)(state)).toEqual([]);
  });

  it("calls out a faulted bay on reactive, and leaves it to the contract otherwise", () => {
    const state = createInitialState(roadsideHub, "s1");
    const bay = state.chargers["bay-1"]!;
    bay.state = "faulted";

    state.site.policy.maintenanceLevel = "reactive";
    const reactive = goodPlayerPolicy({ ...DEFAULT_GOOD_PLAYER, maintenance: "reactive" })(state);
    expect(reactive).toContainEqual({ type: "schedule_repair", chargerBayId: "bay-1" });

    state.site.policy.maintenanceLevel = "standard";
    expect(goodPlayerPolicy(DEFAULT_GOOD_PLAYER)(state)).not.toContainEqual(
      expect.objectContaining({ type: "schedule_repair" }),
    );
    expect(
      goodPlayerPolicy({ ...DEFAULT_GOOD_PLAYER, callOutOnContract: true })(state),
    ).toContainEqual({ type: "schedule_repair", chargerBayId: "bay-1" });
  });

  it("plays a whole day deterministically", () => {
    const policy = goodPlayerPolicy({
      ...DEFAULT_GOOD_PLAYER,
      waveSwing: 0.1,
      queueMarkup: 0.1,
      peakChargeLimit: 0.9,
    });
    const a = runScenario({ scenario: destinationSite, seed: "s1", policy, collectLog: false });
    const b = runScenario({ scenario: destinationSite, seed: "s1", policy, collectLog: false });
    expect(a.finalStateHash).toBe(b.finalStateHash);
    expect(a.finalState.site.policy.maintenanceLevel).toBe("standard");
  });

  it("describes its settings in a short line", () => {
    expect(describeSettings(DEFAULT_GOOD_PLAYER)).toBe("standard price×1.00");
  });
});
