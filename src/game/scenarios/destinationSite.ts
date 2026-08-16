/**
 * "Kesteven Garden Centre" — the destination-site archetype (O6).
 *
 * Prose source: scenario spec §7 — *long-dwell, low urgency, `slow_ac`-heavy —
 * exercises the third tier*.
 *
 * The design job: this is the site where **the grid cap is not the wall and
 * speed is nearly worthless**. People park, leave the car, and go and do
 * something for two hours; they will wait a long time and they are not
 * desperate. Eight slow AC posts at 22 kW draw 176 kW between them, so the
 * 300 kW supply never binds — which means every lesson the corridor hub teaches
 * about power policy is *inapplicable here*, and that is the point.
 *
 * If a single policy wins on this site and on the other two, gate criterion 2
 * has failed. This scenario is built to be the one that disagrees.
 */

import { SCENARIO_DURATION_SECONDS, TICK_SECONDS } from "../core/calibration.ts";
import type { DemandWave, ScenarioConfig } from "../core/types.ts";

const H = 3_600;

const demandWaves: DemandWave[] = [
  {
    // Closed. A destination site has opening hours; the car park is empty.
    id: "closed-night",
    startSecond: 0,
    endSecond: 8 * H,
    arrivalRatePerMinute: 0.01,
    commuterMix: 0.1,
    enrouteMix: 0.4,
    panicMix: 0.5,
    priceElasticity: 0.6,
  },
  {
    id: "opening",
    startSecond: 8 * H,
    endSecond: 10 * H,
    arrivalRatePerMinute: 0.12,
    commuterMix: 0.3,
    enrouteMix: 0.6,
    panicMix: 0.1,
    priceElasticity: 0.9,
  },
  {
    // One long, gentle, all-day plateau rather than peaks. Nothing is urgent.
    id: "mid-morning",
    startSecond: 10 * H,
    endSecond: 13 * H,
    arrivalRatePerMinute: 0.2,
    commuterMix: 0.25,
    enrouteMix: 0.65,
    panicMix: 0.1,
    priceElasticity: 0.8,
  },
  {
    id: "afternoon",
    startSecond: 13 * H,
    endSecond: 17 * H,
    arrivalRatePerMinute: 0.22,
    commuterMix: 0.3,
    enrouteMix: 0.6,
    panicMix: 0.1,
    priceElasticity: 0.8,
  },
  {
    id: "closing",
    startSecond: 17 * H,
    endSecond: 19 * H,
    arrivalRatePerMinute: 0.1,
    commuterMix: 0.35,
    enrouteMix: 0.55,
    panicMix: 0.1,
    priceElasticity: 0.9,
  },
  {
    id: "shut",
    startSecond: 19 * H,
    endSecond: 24 * H,
    arrivalRatePerMinute: 0.02,
    commuterMix: 0.1,
    enrouteMix: 0.5,
    panicMix: 0.4,
    priceElasticity: 0.7,
  },
];

export const destinationSite: ScenarioConfig = {
  id: "destination-site-01",
  name: "Kesteven Garden Centre",
  archetype: "destination_site",
  durationSeconds: SCENARIO_DURATION_SECONDS,
  tickSeconds: TICK_SECONDS,
  demandWaves,
  referencePricePerKwh: 0.62,

  // Eight slow AC posts — the third tier, unused by the other two scenarios.
  // Cheap hardware, lots of it, and speed is beside the point.
  bays: [
    { id: "bay-1", label: "Post 1", type: "slow_ac" },
    { id: "bay-2", label: "Post 2", type: "slow_ac" },
    { id: "bay-3", label: "Post 3", type: "slow_ac" },
    { id: "bay-4", label: "Post 4", type: "slow_ac" },
    { id: "bay-5", label: "Post 5", type: "slow_ac" },
    { id: "bay-6", label: "Post 6", type: "slow_ac" },
    { id: "bay-7", label: "Post 7", type: "slow_ac" },
    { id: "bay-8", label: "Post 8", type: "rapid_dc" },
  ],
  // 7×22 + 50 = 204 kW of appetite against 300. The cap NEVER binds, so power
  // policy is inert here by construction — the honest inverse of the corridor.
  initialGridPowerKw: 300,
  maxQueueLength: 10,

  initialCash: 50_000,
  // Cheap: the charging is an amenity that keeps people on site, not the
  // business. The margin per session is thin and the volume is the point.
  initialPricePerKwh: 0.55,
  initialConnectionFee: 0,
  initialTrust: 60,
  initialPowerPolicy: "equal_share",
  initialMaintenanceLevel: "standard",
  initialPartialChargeTargetSoc: undefined,

  // The whole character of the site: people are somewhere else, doing
  // something else. They will wait an hour without noticing, and nobody
  // arrives in a panic during opening hours.
  patienceMultiplier: 3.0,
  urgencyMultiplier: 0.7,

  energyCostPerKwh: 0.28,
  // A car park with posts on it — barely any standing cost.
  opexPerSimDay: 60,
  upgradeCosts: [
    { from: "slow_ac", to: "rapid_dc", capexCost: 18_000 },
    { from: "rapid_dc", to: "ultrarapid_dc", capexCost: 40_000 },
  ],

  scriptedFaults: [{ atSecond: 11 * H, bayId: "bay-8", category: "software_fault" }],

  // Set from this site's own measured baseline distribution (20 seeds).
  // Thin margins and low costs mean the absolute bar is far lower than the
  // corridor's — £400 here is the same kind of stretch as £2,200 there.
  goals: {
    minOperatingMargin: 400,
    // Nobody is in a hurry — a 22-minute wait is genuinely fine here, which
    // is why the wait goal is nearly three times the corridor's.
    maxAvgWaitSeconds: 1_320,
    minTrust: 55,
    minSessionsCompleted: 75,
  },
  failRules: {
    bankruptcyCashBelow: 0,
    trustBelow: 30,
    trustBelowForSeconds: 7_200,
  },
};
