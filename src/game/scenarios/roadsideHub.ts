/**
 * "Junction 42 Services" — the MVP scenario (Plan D5).
 * Prose source: `ChargePointOperator_Scenario_RoadsideHub.md` v2.2.
 */

import { SCENARIO_DURATION_SECONDS, TICK_SECONDS } from "../core/calibration.ts";
import type { DemandWave, ScenarioConfig } from "../core/types.ts";

const H = 3_600;

/** §3 — the single source of truth for demand. */
const demandWaves: DemandWave[] = [
  {
    id: "night",
    startSecond: 0,
    endSecond: 5 * H,
    arrivalRatePerMinute: 0.04,
    commuterMix: 0.1,
    enrouteMix: 0.4,
    panicMix: 0.5,
    priceElasticity: 0.7,
  },
  {
    id: "early",
    startSecond: 5 * H,
    endSecond: 7 * H,
    arrivalRatePerMinute: 0.1,
    commuterMix: 0.6,
    enrouteMix: 0.3,
    panicMix: 0.1,
    priceElasticity: 1.0,
  },
  {
    id: "am-commute",
    startSecond: 7 * H,
    endSecond: 9.5 * H,
    arrivalRatePerMinute: 0.3,
    commuterMix: 0.8,
    enrouteMix: 0.1,
    panicMix: 0.1,
    priceElasticity: 1.2,
  },
  {
    id: "mid-lull",
    startSecond: 9.5 * H,
    endSecond: 11.5 * H,
    arrivalRatePerMinute: 0.15,
    commuterMix: 0.4,
    enrouteMix: 0.5,
    panicMix: 0.1,
    priceElasticity: 1.0,
  },
  {
    id: "midday",
    startSecond: 11.5 * H,
    endSecond: 14 * H,
    arrivalRatePerMinute: 0.3,
    commuterMix: 0.25,
    enrouteMix: 0.6,
    panicMix: 0.15,
    priceElasticity: 0.9,
  },
  {
    id: "pm-lull",
    startSecond: 14 * H,
    endSecond: 16.5 * H,
    arrivalRatePerMinute: 0.18,
    commuterMix: 0.4,
    enrouteMix: 0.45,
    panicMix: 0.15,
    priceElasticity: 1.0,
  },
  {
    id: "pm-peak",
    startSecond: 16.5 * H,
    endSecond: 19 * H,
    arrivalRatePerMinute: 0.35,
    commuterMix: 0.5,
    enrouteMix: 0.35,
    panicMix: 0.15,
    priceElasticity: 0.8,
  },
  {
    id: "evening",
    startSecond: 19 * H,
    endSecond: 22 * H,
    arrivalRatePerMinute: 0.12,
    commuterMix: 0.3,
    enrouteMix: 0.5,
    panicMix: 0.2,
    priceElasticity: 1.0,
  },
  {
    id: "late",
    startSecond: 22 * H,
    endSecond: 24 * H,
    arrivalRatePerMinute: 0.05,
    commuterMix: 0.1,
    enrouteMix: 0.5,
    panicMix: 0.4,
    priceElasticity: 0.8,
  },
];

export const roadsideHub: ScenarioConfig = {
  id: "roadside-hub-01",
  name: "Junction 42 Services",
  archetype: "corridor_hub",
  durationSeconds: SCENARIO_DURATION_SECONDS,
  tickSeconds: TICK_SECONDS,
  demandWaves,
  referencePricePerKwh: 0.79,

  bays: [
    { id: "bay-1", label: "Bay 1", type: "rapid_dc" },
    { id: "bay-2", label: "Bay 2", type: "rapid_dc" },
    { id: "bay-3", label: "Bay 3", type: "rapid_dc" },
    { id: "bay-4", label: "Bay 4", type: "rapid_dc" },
    { id: "bay-5", label: "Bay 5", type: "ultrarapid_dc" },
    { id: "bay-6", label: "Bay 6", type: "ultrarapid_dc" },
  ],
  initialGridPowerKw: 350,
  maxQueueLength: 12,

  initialCash: 50_000,
  initialPricePerKwh: 0.79,
  initialConnectionFee: 0.99,
  initialTrust: 60,
  initialPowerPolicy: "equal_share",
  initialMaintenanceLevel: "standard",
  initialPartialChargeTargetSoc: undefined,

  energyCostPerKwh: 0.28,
  opexPerSimDay: 150,
  upgradeCosts: [{ from: "rapid_dc", to: "ultrarapid_dc", capexCost: 40_000 }],

  // §4 — the designed problem-reveal beat. Timing is seed-independent, so the
  // target must be a fixed bay id, not "whichever is busier" (D20).
  scriptedFaults: [{ atSecond: 12.5 * H, bayId: "bay-5", category: "power_module_fault" }],

  goals: {
    // Set by Mark, 2026-08-16, from the post-D30/D31 measured distribution
    // (OPEN-7). The lowest round number that closes D13's difficulty floor:
    // the six days the passive baseline used to win outright sit at £2,154,
    // £2,190, £2,220, £2,312, £2,506 and £2,772, so anything below £2,200
    // catches none of them. At £2,200 the baseline fails on 80% of seeds.
    minOperatingMargin: 2_200,
    maxAvgWaitSeconds: 480,
    minTrust: 55,
    minSessionsCompleted: 110,
  },
  failRules: {
    bankruptcyCashBelow: 0,
    trustBelow: 30,
    trustBelowForSeconds: 7_200,
  },
};
