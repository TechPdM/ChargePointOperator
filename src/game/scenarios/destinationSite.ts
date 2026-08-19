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
  /**
   * D42. A market town has other chargers, but they are across town rather than
   * next door, and the driver is parked up doing something else anyway. Real
   * pricing power, well short of the corridor's.
   */
  detourMinutes: [5, 18],

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
  // 7×22 + 150 = 304 kW of nameplate against 350 (was 204 against 300, before
  // the 2026-08-17 rapid re-rating). The cap still NEVER binds, so power policy
  // stays inert here by construction — the honest inverse of the corridor — and
  // the single DC post is vehicle-limited rather than bay-limited, as it should
  // be. Raised 300 → 350 only to preserve that property through the re-rating.
  initialGridPowerKw: 350,
  maxQueueLength: 10,

  // Raised with the upgrade re-pricing (2026-08-17) — see roadsideHub. £100,000
  // affords one ultra step or two DC posts, which is the trade this site is
  // actually about: a little speed for a few, or a bit more speed for more.
  initialCash: 100_000,
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
  // Re-priced with the hardware (2026-08-17). `slow_ac → rapid_dc` is now a
  // 22 → 150 kW step, not 22 → 50, so £18,000 no longer buys it; £35,000 is a
  // 150 kW DC unit on a site that already has the groundwork. The ultra step
  // is the same £75,000 unit as everywhere else.
  upgradeCosts: [
    { from: "slow_ac", to: "rapid_dc", capexCost: 35_000 },
    { from: "rapid_dc", to: "ultrarapid_dc", capexCost: 75_000 },
  ],

  scriptedFaults: [{ atSecond: 11 * H, bayId: "bay-8", category: "software_fault" }],

  // Set from this site's own measured baseline distribution (20 seeds).
  // Thin margins and low costs mean the absolute bar is far lower than the
  // corridor's — £400 here is the same kind of stretch as £2,200 there.
  /**
   * **Re-fitted 2026-08-17.** Only one bay here is DC, so the re-rating moved
   * this site least — but it still slackened the three non-margin goals to
   * 100% met and dropped the D13 floor 80% → 70%. Re-set from the measured
   * 20-seed baseline spread: margin −£28–£589 · trust 56.9–68.0 ·
   * wait 571–1,139 s · sessions 84–107.
   */
  goals: {
    // £520, not a rounder £500, and 95 sessions rather than 90: at £500/90 the
    // same five seeds (s1, s4, s10, s11, s14) passed all four goals and the
    // floor sat at exactly 75%. Wait does not separate them — every seed that
    // fails on wait already fails on margin — so the two thresholds that do
    // were moved by the smallest amount that breaks s1 and s4.
    // Re-fitted for D42/D43 (2026-08-19). §11.2 of the pricing design predicted
    // this site would take the hardest knock and it did: its optimum price fell
    // £0.85 → £0.70 once drivers judged price against a £0.62 local going rate
    // instead of a national one, and margin at optimum fell £845 → £628. The
    // old £520 goal was met on 2/20.
    //
    // Baseline spread: margin £107–£508 (p50 £305) · trust 59.3–65.4
    // (p50 62.1) · wait 6.0–9.5 sim-min (p50 7.8) · sessions 88–100 (p50 94).
    // £300 is the measured baseline median, derived the same way as every other
    // threshold in this file.
    //
    // It was briefly £350 — set above the baseline so that hitting it required
    // finding the pricing lever, which is this site's lesson. That was the one
    // threshold in the whole re-fit argued from design rather than measured off
    // a percentile, and criterion 2 broke at exactly this site under it. Under
    // test, so the reasoning is recoverable if it is ever wanted back.
    minOperatingMargin: 300,
    // Nobody is in a hurry — a 13-minute wait is genuinely fine here, which
    // is why the wait goal is nearly twice the corridor's. Set at 800 rather
    // than 900 because wait runs *anti*-correlated with margin on this site
    // (a busy day is a profitable one), so it is the threshold that catches
    // the seeds margin does not — at 900 the floor sat at 75%.
    // 800 s was met on 20/20 — free — and 540 s left the D13 floor short at
    // 75%. 8 sim-min is still the most generous wait goal of the three sites
    // (the corridor's is 7) so the "nobody here is in a hurry" character
    // survives; it just stops being unconstrained.
    maxAvgWaitSeconds: 480,
    // Trust ran 59.3–65.4 (p50 62.1), so 58 was met on 19/20 — free. 61 sits
    // just under the median and makes a bad day on trust cost something.
    minTrust: 61,
    // 90 left the D13 floor at 70%. 94 is the measured median.
    minSessionsCompleted: 94,
  },
};
