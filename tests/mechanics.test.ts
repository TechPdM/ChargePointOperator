/**
 * Mechanics tests — each one pins a formula or rule to the document that
 * defines it, so a silent retune shows up as a red test rather than as a
 * mysterious change in the seed batch.
 */

import { describe, expect, it } from "vitest";
import {
  ACCEPT_THRESHOLD,
  ARCHETYPES,
  DETOUR_PREMIUM_MAX,
  MAINTENANCE,
  taper,
  TRUST,
  WAIT_PERCEPTION_NOISE,
} from "../src/game/core/calibration.ts";
import { createInitialState } from "../src/game/core/init.ts";
import { runScenario } from "../src/game/core/run.ts";
import { baselinePolicy } from "../src/game/experiment/baselinePolicy.ts";
import { tick } from "../src/game/core/tick.ts";
import { queueAction } from "../src/game/actions/playerActions.ts";
import { siteScore } from "../src/game/systems/admission.ts";
import { detourPremiumPerKwh, priceMultiplier } from "../src/game/systems/arrivals.ts";
import { abandonProbability } from "../src/game/systems/queue.ts";
import { faultProbabilityPerTick } from "../src/game/systems/faults.ts";
import { roadsideHub } from "../src/game/scenarios/roadsideHub.ts";

/** Read from the scenario, not hardcoded — it moves when the hardware is re-rated. */
const UPGRADE_COST = roadsideHub.upgradeCosts[0]?.capexCost ?? 0;
import type { SimulationState, VehicleAgent, VehicleArchetype } from "../src/game/core/types.ts";

function vehicle(archetype: VehicleArchetype, urgency: number): VehicleAgent {
  const p = ARCHETYPES[archetype];
  return {
    id: "v-test",
    archetype,
    state: "arriving",
    batteryCapacityKwh: 60,
    maxChargeRateKw: 120,
    currentSoc: 0.3,
    arrivalSecond: 0,
    urgencyScore: urgency,
    priceSensitivity: p.priceSensitivity,
    waitSensitivity: p.waitSensitivity,
    demand: {
      targetSoc: p.targetSoc,
      requestedKwh: 30,
      maxAcceptablePricePerKwh: p.maxAcceptablePricePerKwh,
      patienceSeconds: p.patienceSeconds,
    },
  };
}

/** Wait at which siteScore falls to ACCEPT_THRESHOLD. */
function walkAwayWaitSeconds(archetype: VehicleArchetype, urgency: number): number {
  let lo = 0;
  let hi = 20_000;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (siteScore(vehicle(archetype, urgency), 0.79, mid, 60) >= ACCEPT_THRESHOLD) lo = mid;
    else hi = mid;
  }
  return lo;
}

describe("admission — Calibration §5 worked example (D21)", () => {
  it("reproduces the published siteScore intercepts at £0.79 / trust 60", () => {
    expect(siteScore(vehicle("commuter", 0.4), 0.79, 0, 60)).toBeCloseTo(0.696, 3);
    expect(siteScore(vehicle("enroute", 0.6), 0.79, 0, 60)).toBeCloseTo(1.512, 3);
    expect(siteScore(vehicle("panic_low_soc", 0.95), 0.79, 0, 60)).toBeCloseTo(2.188, 3);
  });

  it("sheds commuters first, then en-route, then panic", () => {
    const commuter = walkAwayWaitSeconds("commuter", 0.4) / 60;
    const enroute = walkAwayWaitSeconds("enroute", 0.6) / 60;
    const panic = walkAwayWaitSeconds("panic_low_soc", 0.95) / 60;

    expect(commuter).toBeGreaterThan(8);
    expect(commuter).toBeLessThan(10);
    expect(enroute).toBeGreaterThan(25);
    expect(enroute).toBeLessThan(29);
    expect(panic).toBeGreaterThan(95);
    expect(commuter).toBeLessThan(enroute);
    expect(enroute).toBeLessThan(panic);
  });

  it("prices commuters out entirely at £1.10 — the demand-shaping lever", () => {
    expect(siteScore(vehicle("commuter", 0.4), 1.1, 0, 60)).toBeLessThan(ACCEPT_THRESHOLD);
    // …and their hard reject has already fired well below that.
    expect(ARCHETYPES.commuter.maxAcceptablePricePerKwh).toBeLessThan(1.1);
  });
});

describe("demand — one elasticity formula (D21)", () => {
  it("is neutral at the reference price", () => {
    expect(priceMultiplier(0.79, 0.79, 1.2)).toBe(1);
  });

  it("uses the wave's own coefficient", () => {
    // +10% price on a 1.2-elasticity wave ⇒ −12% demand.
    expect(priceMultiplier(0.79 * 1.1, 0.79, 1.2)).toBeCloseTo(0.88, 6);
    expect(priceMultiplier(0.79 * 1.1, 0.79, 0.7)).toBeCloseTo(0.93, 6);
  });

  it("clamps to [0.3, 1.5]", () => {
    expect(priceMultiplier(1.2, 0.79, 1.2)).toBeGreaterThanOrEqual(0.3);
    expect(priceMultiplier(0.45, 0.79, 1.2)).toBeLessThanOrEqual(1.5);
  });
});

describe("charging — two-segment taper (A1/D14)", () => {
  it("is full power below 80% SOC and 40% at or above", () => {
    expect(taper(0.79)).toBe(1);
    expect(taper(0.8)).toBe(0.4);
    // A session targeting 0.80 never enters the taper zone.
    expect(taper(0.799)).toBe(1);
  });
});

describe("abandonment ramp (Calibration §5)", () => {
  it("is zero before patience is spent, then ramps to 0.5/tick over 600 s", () => {
    expect(abandonProbability(899, 900)).toBe(0);
    expect(abandonProbability(900, 900)).toBe(0);
    expect(abandonProbability(1_200, 900)).toBeCloseTo(0.25, 6);
    expect(abandonProbability(1_500, 900)).toBeCloseTo(0.5, 6);
    expect(abandonProbability(9_999, 900)).toBeCloseTo(0.5, 6);
  });
});

describe("fault model (Calibration §5)", () => {
  it("integrates to ≈ (1 − reliabilityBase) over a session", () => {
    const ticks = 20;
    const p = faultProbabilityPerTick(0.985, ticks, 1);
    const surviveSession = (1 - p) ** ticks;
    expect(1 - surviveSession).toBeGreaterThan(0.013);
    expect(1 - surviveSession).toBeLessThan(0.016);
  });

  it("scales with the maintenance multiplier", () => {
    const standard = faultProbabilityPerTick(0.975, 10, MAINTENANCE.standard.faultProbabilityMultiplier);
    const preventive = faultProbabilityPerTick(0.975, 10, MAINTENANCE.preventive.faultProbabilityMultiplier);
    expect(preventive).toBeCloseTo(standard * 0.5, 12);
  });
});

// --- D19 semantics ----------------------------------------------------------

function advance(state: SimulationState, ticks: number): SimulationState {
  let s = state;
  for (let i = 0; i < ticks; i++) s = tick(s).state;
  return s;
}

function stateWithBusyBay(seed = "s1"): SimulationState {
  // The am-commute wave reliably fills bays; run into it.
  let s = createInitialState(roadsideHub, seed);
  s = advance(s, 480);
  return s;
}

describe("D19 — interruption and deferred bay transitions", () => {
  it("a fault detaches and finalizes the session before the bay faults", () => {
    let s = stateWithBusyBay();
    const busy = Object.values(s.chargers).find((b) => b.state === "charging");
    expect(busy).toBeDefined();
    if (!busy) return;

    // Force the fault: p = (1 − reliabilityBase) / expectedSessionTicks, so
    // zero reliability over a one-tick horizon makes it certain.
    const bay = s.chargers[busy.id];
    const session = busy.activeSessionId ? s.sessions[busy.activeSessionId] : undefined;
    if (!bay || !session) throw new Error("expected a charging bay with a session");
    bay.spec = { ...bay.spec, reliabilityBase: 0 };
    session.expectedSessionTicks = 1;
    session.requestedKwh = 1e6; // don't let it complete before it can fault
    // Stepped by hand rather than through `advance`, to keep this tick's
    // events: a concluded session is dropped from `state.sessions`, so the log
    // is where its finalized numbers survive.
    const stepped = tick(s);
    s = stepped.state;

    const after = s.chargers[busy.id];
    expect(after?.state).toBe("faulted");
    expect(after?.activeSessionId).toBeUndefined();
    expect(after?.allocatedPowerKw).toBe(0);

    // Finalized as an interruption rather than a completion, and with its
    // energy already recorded — all of which happened before the bay faulted,
    // which is the D19 ordering this test exists for.
    const forSession = stepped.events.filter((e) => e.entity_id === session.id);
    const interrupted = forSession.find((e) => e.event_name === "session.interrupted");
    expect(interrupted).toBeDefined();
    expect(forSession.some((e) => e.event_name === "session.completed")).toBe(false);
    expect(Number(interrupted?.data?.["delivered_kwh"])).toBeGreaterThan(0);
    expect(s.sessions[session.id]).toBeUndefined();

    // The driver left, and left for this reason. Read from `departedVehicles`
    // since D39 moves them off `vehicles` on departure — and assert they are no
    // longer on site, which is the half a lookup alone would not have caught.
    const v = s.departedVehicles.find((d) => d.id === session.vehicleId);
    expect(v?.leaveReason).toBe("service_interrupted");
    expect(v?.outcome).toBe("left");
    expect(s.vehicles[session.vehicleId]).toBeUndefined();
    expect(s.site.metrics.funnel.interruptedByFault).toBeGreaterThan(0);
  });

  it("closing a busy bay latches rather than terminating the session", () => {
    let s = stateWithBusyBay();
    const busy = Object.values(s.chargers).find((b) => b.state === "charging");
    if (!busy) throw new Error("expected a busy bay");
    const sessionId = busy.activeSessionId;

    s = queueAction(s, { type: "toggle_bay_group", bayIds: [busy.id], open: false });
    s = advance(s, 1);

    const after = s.chargers[busy.id];
    expect(after?.closeRequested).toBe(true);
    expect(after?.isOpen).toBe(true);
    expect(after?.activeSessionId).toBe(sessionId);

    // It closes once the session ends — and never sooner.
    s = advance(s, 200);
    const later = s.chargers[busy.id];
    expect(later?.isOpen).toBe(false);
    expect(later?.closeRequested).toBe(false);
    expect(later?.activeSessionId).toBeUndefined();
  });

  it("opening a bay applies immediately and cancels a pending close", () => {
    let s = stateWithBusyBay();
    const busy = Object.values(s.chargers).find((b) => b.state === "charging");
    if (!busy) throw new Error("expected a busy bay");

    s = queueAction(s, { type: "toggle_bay_group", bayIds: [busy.id], open: false });
    s = advance(s, 1);
    s = queueAction(s, { type: "toggle_bay_group", bayIds: [busy.id], open: true });
    s = advance(s, 1);

    expect(s.chargers[busy.id]?.closeRequested).toBe(false);
    expect(s.chargers[busy.id]?.isOpen).toBe(true);
  });

  it("upgrading a busy bay debits capex now and swaps the spec when it idles", () => {
    let s = stateWithBusyBay();
    const busy = Object.values(s.chargers).find(
      (b) => b.state === "charging" && b.spec.type === "rapid_dc",
    );
    if (!busy) throw new Error("expected a busy rapid bay");
    const cashBefore = s.site.economics.cash;

    s = queueAction(s, {
      type: "upgrade_charger",
      chargerBayId: busy.id,
      newType: "ultrarapid_dc",
    });
    s = advance(s, 1);

    expect(s.site.economics.capexSpentToday).toBe(UPGRADE_COST);
    expect(cashBefore - s.site.economics.cash).toBeGreaterThan(UPGRADE_COST - 100);
    expect(s.chargers[busy.id]?.pendingUpgradeType).toBe("ultrarapid_dc");
    expect(s.chargers[busy.id]?.spec.type).toBe("rapid_dc");

    s = advance(s, 200);
    expect(s.chargers[busy.id]?.spec.type).toBe("ultrarapid_dc");
    expect(s.chargers[busy.id]?.pendingUpgradeType).toBeUndefined();
    // Capex is a one-off, not a recurring charge.
    expect(s.site.economics.capexSpentToday).toBe(UPGRADE_COST);
  });

  /**
   * The reducer refuses what it cannot pay for.
   *
   * This is the gap that let a £75,000 upgrade be unbuyable out of £50,000 with
   * the whole suite green: affordability lived only in `BayAvailabilityPanel`,
   * so every capex test here passed on a purchase the UI would have declined.
   */
  it("refuses an unaffordable upgrade outright — no debit, no swap, no latch", () => {
    let s = stateWithBusyBay();
    const busy = Object.values(s.chargers).find(
      (b) => b.state === "charging" && b.spec.type === "rapid_dc",
    );
    if (!busy) throw new Error("expected a busy rapid bay");

    // One pound short is still short: the boundary is `cash >= capexCost`.
    s.site.economics.cash = UPGRADE_COST - 1;
    const cashBefore = s.site.economics.cash;

    s = queueAction(s, {
      type: "upgrade_charger",
      chargerBayId: busy.id,
      newType: "ultrarapid_dc",
    });
    s = advance(s, 1);

    expect(s.site.economics.capexSpentToday).toBe(0);
    // Not exact equality: the tick still trades, so cash drifts by a few pounds
    // of revenue and energy cost either way. What must not appear is the hole.
    expect(s.site.economics.cash).toBeGreaterThan(cashBefore - 1_000);
    expect(s.chargers[busy.id]?.pendingUpgradeType).toBeUndefined();

    // Still a rapid bay 200 ticks later — a refusal is not a deferral.
    s = advance(s, 200);
    expect(s.chargers[busy.id]?.spec.type).toBe("rapid_dc");
  });

  it("buys at exactly the asking price — the boundary is inclusive", () => {
    let s = stateWithBusyBay();
    const busy = Object.values(s.chargers).find(
      (b) => b.state === "charging" && b.spec.type === "rapid_dc",
    );
    if (!busy) throw new Error("expected a busy rapid bay");

    s.site.economics.cash = UPGRADE_COST;
    s = queueAction(s, {
      type: "upgrade_charger",
      chargerBayId: busy.id,
      newType: "ultrarapid_dc",
    });
    s = advance(s, 1);

    expect(s.site.economics.capexSpentToday).toBe(UPGRADE_COST);
    expect(s.chargers[busy.id]?.pendingUpgradeType).toBe("ultrarapid_dc");
  });
});

describe("repair rules — Architecture §4.4", () => {
  it("a faulted bay waits indefinitely until schedule_repair is issued", () => {
    let s = createInitialState(roadsideHub, "s1");
    const bay = s.chargers["bay-3"];
    if (!bay) throw new Error("no bay-3");
    bay.state = "faulted";
    bay.faultedAtSecond = 0;

    s = advance(s, 300);
    expect(s.chargers["bay-3"]?.state).toBe("faulted");
    expect(s.site.metrics.downtimeFaultSeconds).toBeGreaterThan(17_000);
  });

  it("schedule_repair debits immediately and returns the bay after the repair time", () => {
    let s = createInitialState(roadsideHub, "s1");
    const bay = s.chargers["bay-3"];
    if (!bay) throw new Error("no bay-3");
    bay.state = "faulted";
    const cashBefore = s.site.economics.cash;

    s = queueAction(s, { type: "schedule_repair", chargerBayId: "bay-3" });
    s = advance(s, 1);
    expect(s.chargers["bay-3"]?.state).toBe("repairing");
    // £200 under `standard`, minus nothing else material on tick 1.
    expect(cashBefore - s.site.economics.cash).toBeGreaterThan(190);

    // rapid_dc repairs in 2,700 s at ×1.0 ⇒ 45 ticks.
    s = advance(s, 44);
    expect(s.chargers["bay-3"]?.state).toBe("repairing");
    s = advance(s, 2);
    expect(s.chargers["bay-3"]?.state).toBe("idle");
  });

  it("schedule_repair on a healthy bay is a logged no-op with no cost", () => {
    let s = createInitialState(roadsideHub, "s1");
    const cashBefore = s.site.economics.cash;
    s = queueAction(s, { type: "schedule_repair", chargerBayId: "bay-2" });
    const { state: next, events } = tick(s);
    expect(next.chargers["bay-2"]?.state).toBe("idle");
    expect(cashBefore - next.site.economics.cash).toBeLessThan(1);
    const marker = events.find((e) => e.event_name === "charger.repair_scheduled");
    expect(marker?.level).toBe("warn");
    expect(marker?.data?.["applied"]).toBe(false);
  });

  it("preventive maintenance repairs faster than standard", () => {
    expect(MAINTENANCE.preventive.repairTimeMultiplier).toBeLessThan(
      MAINTENANCE.standard.repairTimeMultiplier,
    );
  });
});

describe("partial charge (D14)", () => {
  it("caps requested energy, flags the session, and costs a little trust", () => {
    let s = createInitialState(roadsideHub, "s1");
    s = queueAction(s, { type: "set_partial_charge_target", targetSoc: 0.7 });
    s = advance(s, 700);

    const capped = Object.values(s.sessions).filter((x) => x.partialChargeCapped);
    expect(capped.length).toBeGreaterThan(0);
    for (const session of capped) {
      expect(session.targetSoc).toBeLessThanOrEqual(0.7);
    }
    expect(TRUST.partialChargeCapped).toBeLessThan(0);
  });

  it("never raises a driver's own target above what they asked for", () => {
    let s = createInitialState(roadsideHub, "s1");
    s = queueAction(s, { type: "set_partial_charge_target", targetSoc: 0.9 });
    s = advance(s, 700);
    for (const session of Object.values(s.sessions)) {
      const v = s.vehicles[session.vehicleId];
      if (v) expect(session.targetSoc).toBeLessThanOrEqual(v.demand.targetSoc);
    }
  });
});

describe("KPI definitions (D12)", () => {
  it("player-closed bay time is excluded from the uptime denominator", () => {
    let s = createInitialState(roadsideHub, "s1");
    s = queueAction(s, {
      type: "toggle_bay_group",
      bayIds: ["bay-1", "bay-2", "bay-3"],
      open: false,
    });
    s = advance(s, 60);

    expect(s.site.metrics.downtimeClosedSeconds).toBeGreaterThan(0);
    // Closing bays must not be a trick to inflate uptime — it stays at 100%.
    expect(s.site.metrics.uptimePct).toBe(100);
    expect(s.site.openBayIds.length).toBe(3);
  });

  it("counts a faulted bay against uptime", () => {
    let s = createInitialState(roadsideHub, "s1");
    const bay = s.chargers["bay-1"];
    if (bay) bay.state = "faulted";
    s = advance(s, 30);
    expect(s.site.metrics.uptimePct).toBeLessThan(100);
    expect(s.site.metrics.uptimePct).toBeGreaterThan(70);
  });
});

describe("trust (Calibration §5, rebalanced by D30)", () => {
  it("pays nothing for merely completing a session", () => {
    // Serving someone is the job. A day has ~183 completions against ~10
    // failures, so any per-completion reward swamps every penalty — which is
    // exactly how trust used to run to the ceiling on every competent run.
    expect(TRUST.completion).toBe(0);
  });

  it("rewards a short wait and penalises a long one, exclusively", () => {
    expect(TRUST.fastCompletionBonus).toBeGreaterThan(0);
    expect(TRUST.slowCompletionPenalty).toBeLessThan(0);
    // They are alternatives, not a stack: one or the other applies per session.
    expect(TRUST.fastCompletionBonus + TRUST.slowCompletionPenalty).toBeLessThan(
      TRUST.fastCompletionBonus,
    );
  });

  it("treats driving past as a reputation event, not a rounding error", () => {
    // ~18% of the day's demand leaves at the gate; at −0.05 that was −2 trust
    // a day against +60 of completion bonuses.
    expect(Math.abs(TRUST.priceRejection)).toBeGreaterThanOrEqual(0.15);
  });

  it("keeps the baseline's trust inside the calibrated band", () => {
    const trusts = ["s1", "s2", "s3", "s4"].map(
      (seed) =>
        runScenario({
          scenario: roadsideHub,
          seed,
          policy: baselinePolicy,
          collectLog: false,
        }).finalState.site.metrics.trust,
    );
    for (const trust of trusts) {
      expect(trust).toBeGreaterThan(40);
      expect(trust).toBeLessThan(75);
    }
  });

  it("clamps net movement to ±5 over a rolling sim-hour", () => {
    let s = createInitialState(roadsideHub, "s1");
    // 60 ticks = one sim-hour.
    s = advance(s, 60);
    expect(Math.abs(s.site.metrics.trust - roadsideHub.initialTrust)).toBeLessThanOrEqual(5.0001);
    expect(Math.abs(s.site.metrics.trustDeltaThisHour)).toBeLessThanOrEqual(5.0001);
  });
});

describe("perceived wait (OPEN-5 / A4, D31)", () => {
  it("drivers judge a wait they can only estimate", () => {
    expect(WAIT_PERCEPTION_NOISE).toBeGreaterThan(0);
  });

  it("the wait a driver acted on is recorded, and it is not the true one", () => {
    // With perfect information every arrival read the true projected wait and
    // drove on, so the queue capped itself and abandonment did no work at all.
    let s = createInitialState(roadsideHub, "s2");
    s = advance(s, 900);
    // Everyone who has judged a wait today, on site or gone. Most of a day's
    // arrivals have left by tick 900, and since D39 they live in
    // `departedVehicles` — which carries `expectedWaitSeconds` for exactly this
    // reason: the wait a driver acted on is the record, not the agent.
    const judged = [
      ...Object.values(s.vehicles).map((v) => v.expectedWaitSeconds),
      ...s.departedVehicles.map((d) => d.expectedWaitSeconds),
    ].filter((w): w is number => w !== undefined && w > 0);
    expect(judged.length).toBeGreaterThan(5);
    // Perceived waits spread around the truth rather than all matching it.
    expect(new Set(judged.map((w) => Math.round(w))).size).toBeGreaterThan(3);
  });

  it("the log carries both the perceived and the true wait", () => {
    const run = runScenario({ scenario: roadsideHub, seed: "s2", policy: baselinePolicy });
    const judged = run.logger
      .getEvents()
      .filter((e) => e.event_name === "vehicle.site_rejected" || e.event_name === "vehicle.site_accepted");
    expect(judged.length).toBeGreaterThan(50);
    const withBoth = judged.filter(
      (e) => e.data?.["expected_wait_seconds"] !== undefined && e.data?.["true_wait_seconds"] !== undefined,
    );
    expect(withBoth.length).toBe(judged.length);
    // …and they genuinely differ, or the noise isn't reaching the decision.
    const differing = withBoth.filter(
      (e) => e.data?.["expected_wait_seconds"] !== e.data?.["true_wait_seconds"],
    );
    expect(differing.length).toBeGreaterThan(0);
  });
});

describe("detour premium (D42)", () => {
  it("is zero when the alternative is right there", () => {
    expect(detourPremiumPerKwh(0, 11.21, 21)).toBe(0);
  });

  it("is the detour's time cost spread over the energy bought", () => {
    // 30 min at £11.21/hr = £5.605, over 21 kWh = £0.267/kWh.
    expect(detourPremiumPerKwh(30, 11.21, 21)).toBeCloseTo(0.267, 3);
  });

  it("rises with detour", () => {
    const near = detourPremiumPerKwh(5, 5.12, 30);
    const far = detourPremiumPerKwh(20, 5.12, 30);
    expect(far).toBeGreaterThan(near);
  });

  it("falls as the driver buys more energy", () => {
    const topUp = detourPremiumPerKwh(20, 11.21, 10);
    const fill = detourPremiumPerKwh(20, 11.21, 40);
    expect(topUp).toBeGreaterThan(fill);
  });

  it("is clamped at the top — a 10 kWh top-up after a long detour", () => {
    // (60/60) × 11.21 / 10 = £1.121/kWh unclamped, which is more than the whole
    // price range. The clamp is what stops the tail running away.
    expect(detourPremiumPerKwh(60, 11.21, 10)).toBe(DETOUR_PREMIUM_MAX);
  });

  it("never divides by zero when a driver wants nothing", () => {
    expect(detourPremiumPerKwh(20, 11.21, 0)).toBe(DETOUR_PREMIUM_MAX);
  });
});
