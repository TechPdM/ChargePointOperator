/**
 * "Eastgate Park & Charge" — the commuter-hub archetype (O6).
 *
 * Prose source: scenario spec §7 — *two sharp peaks, dead midday, low panic*.
 *
 * The design job this scenario does that the roadside hub cannot: it is a site
 * where **almost all the demand is price-sensitive commuters**, arriving in two
 * violent bursts with six dead hours between them. That inverts the corridor
 * hub's logic. On the corridor, en-route drivers pay whatever it costs and the
 * grid cap is the wall; here the customers walk at a penny too much, the peaks
 * are short enough that queue management matters more than energy, and the
 * midday lull is so empty that any standing cost is dead weight.
 *
 * It exists to make gate criterion 2 answerable: if the same policy wins here
 * and on the corridor, there is a dominant strategy.
 */

import { SCENARIO_DURATION_SECONDS, TICK_SECONDS } from "../core/calibration.ts";
import type { DemandWave, ScenarioConfig } from "../core/types.ts";

const H = 3_600;

const demandWaves: DemandWave[] = [
  {
    id: "night",
    startSecond: 0,
    endSecond: 5.5 * H,
    arrivalRatePerMinute: 0.02,
    commuterMix: 0.2,
    enrouteMix: 0.4,
    panicMix: 0.4,
    priceElasticity: 0.8,
  },
  {
    id: "early",
    startSecond: 5.5 * H,
    endSecond: 7 * H,
    arrivalRatePerMinute: 0.14,
    commuterMix: 0.85,
    enrouteMix: 0.1,
    panicMix: 0.05,
    priceElasticity: 1.2,
  },
  {
    // The first spike: everyone plugs in on the way into work, inside 90 min.
    id: "am-spike",
    startSecond: 7 * H,
    endSecond: 8.5 * H,
    arrivalRatePerMinute: 0.55,
    commuterMix: 0.92,
    enrouteMix: 0.05,
    panicMix: 0.03,
    priceElasticity: 1.4,
  },
  {
    id: "am-tail",
    startSecond: 8.5 * H,
    endSecond: 10 * H,
    arrivalRatePerMinute: 0.16,
    commuterMix: 0.75,
    enrouteMix: 0.2,
    panicMix: 0.05,
    priceElasticity: 1.2,
  },
  {
    // Six hours of near-nothing. Standing costs have nothing to earn against.
    id: "dead-midday",
    startSecond: 10 * H,
    endSecond: 16 * H,
    arrivalRatePerMinute: 0.05,
    commuterMix: 0.35,
    enrouteMix: 0.55,
    panicMix: 0.1,
    priceElasticity: 0.9,
  },
  {
    // The second spike: the same cars going home, tighter and less forgiving.
    id: "pm-spike",
    startSecond: 16 * H,
    endSecond: 18 * H,
    arrivalRatePerMinute: 0.6,
    commuterMix: 0.9,
    enrouteMix: 0.07,
    panicMix: 0.03,
    priceElasticity: 1.3,
  },
  {
    id: "pm-tail",
    startSecond: 18 * H,
    endSecond: 20.5 * H,
    arrivalRatePerMinute: 0.12,
    commuterMix: 0.6,
    enrouteMix: 0.3,
    panicMix: 0.1,
    priceElasticity: 1.1,
  },
  {
    id: "late",
    startSecond: 20.5 * H,
    endSecond: 24 * H,
    arrivalRatePerMinute: 0.04,
    commuterMix: 0.2,
    enrouteMix: 0.5,
    panicMix: 0.3,
    priceElasticity: 0.9,
  },
];

export const commuterHub: ScenarioConfig = {
  id: "commuter-hub-01",
  name: "Eastgate Park & Charge",
  archetype: "commuter_hub",
  durationSeconds: SCENARIO_DURATION_SECONDS,
  tickSeconds: TICK_SECONDS,
  demandWaves,
  referencePricePerKwh: 0.72,
  /**
   * D42. Chargers on the next street, a supermarket bank round the corner, and
   * home charging as the fallback that costs nothing to reach. Almost no
   * pricing power — this is the site where premium pricing should hurt.
   */
  detourMinutes: [2, 7],

  // Six rapid bays, no ultra. Commuters cap around 90–120 kW and dwell for a
  // top-up, so ultra-rapid hardware would buy almost nothing — which makes the
  // upgrade a genuinely different question here than on the corridor.
  //
  // The 2026-08-17 re-rating sharpens this rather than blunting it: a 150 kW
  // rapid bay already exceeds what a commuter car will take, so the tier is now
  // vehicle-limited here by construction and 350 kW hardware would be pure
  // waste. That is the honest version of the point this scenario exists to make.
  bays: [
    { id: "bay-1", label: "Bay 1", type: "rapid_dc" },
    { id: "bay-2", label: "Bay 2", type: "rapid_dc" },
    { id: "bay-3", label: "Bay 3", type: "rapid_dc" },
    { id: "bay-4", label: "Bay 4", type: "rapid_dc" },
    { id: "bay-5", label: "Bay 5", type: "rapid_dc" },
    { id: "bay-6", label: "Bay 6", type: "rapid_dc" },
  ],
  // Re-sized with the hardware (2026-08-17). Nameplate is now 6 × 150 = 900 kW,
  // but commuter cars cap at 60–120 kW, so realistic full-occupancy draw is
  // ~540 kW. 450 kW keeps the original intent exactly — the cap binds during
  // the two spikes and only for 90 minutes at a time — measured against actual
  // acceptance rather than against nameplate.
  initialGridPowerKw: 450,
  maxQueueLength: 14,

  // Raised with the upgrade re-pricing (2026-08-17) so the ultra swap stays a
  // decision rather than a greyed-out button — see roadsideHub for the full
  // note. It matters more here, not less: this is the scenario whose whole
  // point is that the upgrade is *not* worth buying, and a lesson you are
  // prevented from learning the hard way is not a lesson.
  initialCash: 100_000,
  // Cheaper than the corridor: this is a competitive urban site and the
  // customers are the price-sensitive archetype.
  initialPricePerKwh: 0.72,
  initialConnectionFee: 0.5,
  initialTrust: 60,
  initialPowerPolicy: "equal_share",
  initialMaintenanceLevel: "standard",
  initialPartialChargeTargetSoc: undefined,

  // Commuters are in a hurry to get to work, not to sit around.
  patienceMultiplier: 0.8,

  energyCostPerKwh: 0.28,
  opexPerSimDay: 120,
  // Same hardware, same price as the corridor (2026-08-17): a 150 → 350 kW
  // swap. Leaving it at £40,000 would have made the same unit cost different
  // money in different scenarios.
  upgradeCosts: [{ from: "rapid_dc", to: "ultrarapid_dc", capexCost: 75_000 }],

  // Right at the top of the evening spike, when there is no slack anywhere.
  scriptedFaults: [{ atSecond: 16.75 * H, bayId: "bay-3", category: "connector_fault" }],

  // Set from this site's own measured baseline distribution (20 seeds), not
  // from the numbers guessed while writing it — the habit OPEN-3 and OPEN-7
  // established. Margin sits at the baseline p80 (£949) so a passive operator
  // fails it about four days in five.
  //
  // The sessions goal is the interesting one: it is set just above what a
  // premium-pricing strategy achieves here (106), so on a site full of
  // price-sensitive commuters, charging more costs you the volume goal. That
  // tension is the whole reason this archetype exists.
  /**
   * **Re-fitted 2026-08-17** alongside the hardware re-rating, which lifted this
   * site's throughput enough to slacken every threshold at once (D13 floor fell
   * 85% → 55%). Re-set from the measured 20-seed baseline spread:
   * margin £324–£1,369 · trust 53.1–64.7 · wait 207–323 s · sessions 136–167.
   *
   * Margin stays the sharp constraint here, as it was before — this is a
   * competitive urban site whose customers are the price-sensitive archetype,
   * and the money is the thing that is genuinely hard to make.
   */
  goals: {
    minOperatingMargin: 1_200,
    maxAvgWaitSeconds: 310,
    minTrust: 60,
    minSessionsCompleted: 145,
  },
};
