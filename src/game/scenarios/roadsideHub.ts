/**
 * "Junction 42 Services" — the MVP scenario (Plan D5).
 * Prose source: `ChargePointOperator_Scenario_RoadsideHub.md` v2.2.
 */

import { SCENARIO_DURATION_SECONDS, TICK_SECONDS } from "../core/calibration.ts";
import type { DemandWave, ScenarioConfig } from "../core/types.ts";

const H = 3_600;

/**
 * **NEW (Mark, 2026-08-17), a consequence of the hardware re-rating.**
 *
 * The wave rates below were calibrated against 50 kW rapid bays. Re-rating the
 * hardware to 150/350 kW roughly halves service time, and a 6-bay site that
 * turns cars around twice as fast stops being under any pressure at all: the
 * D13 difficulty floor fell from 80% to 25%, avg wait from 5.5 to 1.9 sim-min,
 * abandonment from 1.8% to 0.1%, and trust ran up to 76.
 *
 * Raising demand alongside the hardware is the physically honest fix rather than
 * a fudge — the fleet grew with the chargers, and corridor traffic in 2026 is
 * not 2019 traffic. ×1.8 is the measured point that restores the floor to
 * exactly 80% (16/20 seeds), scanned over ×1.0–×2.4 at 20 seeds each:
 *
 *   ×1.0 25% · ×1.2 20% · ×1.4 10% · ×1.6 40% · ×1.8 80% · ×2.0 100%
 *
 * ×2.0 and above is a site in permanent collapse — trust_crash on 9/20 seeds
 * and rising — so the usable window is narrow and this is the top of it.
 *
 * One constant, so the whole change is revertible in one place.
 */
const DEMAND_SCALE = 1.8;

/** §3 — the single source of truth for demand. */
const baseDemandWaves: DemandWave[] = [
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

const demandWaves: DemandWave[] = baseDemandWaves.map((w) => ({
  ...w,
  arrivalRatePerMinute: w.arrivalRatePerMinute * DEMAND_SCALE,
}));

export const roadsideHub: ScenarioConfig = {
  id: "roadside-hub-01",
  name: "Junction 42 Services",
  archetype: "corridor_hub",
  durationSeconds: SCENARIO_DURATION_SECONDS,
  tickSeconds: TICK_SECONDS,
  demandWaves,
  referencePricePerKwh: 0.79,
  /**
   * D42. The next rapid is a junction away if you drive on, and one junction
   * back if you have just passed it. UK motorway rapid hubs sit at roughly
   * 20–25 mile spacing, which is 20–30 min once you count leaving the road and
   * rejoining it — and near the bottom of the range if you are willing to turn
   * round. This is the site with genuine pricing power, and the width of the
   * range is direction of approach.
   */
  detourMinutes: [8, 30],

  bays: [
    { id: "bay-1", label: "Bay 1", type: "rapid_dc" },
    { id: "bay-2", label: "Bay 2", type: "rapid_dc" },
    { id: "bay-3", label: "Bay 3", type: "rapid_dc" },
    { id: "bay-4", label: "Bay 4", type: "rapid_dc" },
    { id: "bay-5", label: "Bay 5", type: "ultrarapid_dc" },
    { id: "bay-6", label: "Bay 6", type: "ultrarapid_dc" },
  ],
  /**
   * **Re-sized with the hardware (Mark, 2026-08-17).** Nameplate is now
   * 4 × 150 + 2 × 350 = 1,300 kW. Real sites are always connected well below
   * nameplate and enforce the gap with load management — the industry reference
   * point is ~1.5 MVA for a 10–12 × 150 kW hub (~83%), while a 32-bay super hub
   * like Moto Tamworth needed a dedicated 14 MVA substation.
   *
   * 650 kW is 50% of nameplate: a site sized for typical peak rather than
   * absolute peak, which is the common UK position and the reason the grid
   * connection queue is a policy problem. It is also where the mechanic lives —
   * measured, throughput plateaus at ~800 kW and is flat to the last decimal
   * above it, so anything ≥ 900 kW makes `power_choke` unreachable.
   */
  initialGridPowerKw: 650,
  maxQueueLength: 12,

  /**
   * **Raised 2026-08-17 with the upgrade re-pricing, and it is a fix, not a
   * gift.** £50,000 against a £75,000 ultra-rapid swap left the upgrade button
   * permanently disabled — `BayAvailabilityPanel` gates on
   * `cash >= capexCost`, and a day nets ~£3,500, so it was unaffordable at
   * 00:00 and still unaffordable at 23:59. That silently killed a core lever
   * and falsified this sheet's own "starting capital funds at most one".
   *
   * The headless action path does **not** check affordability — it just debits
   * — which is why the scripted margin_trap test bought one happily and no
   * test caught this. Worth knowing before trusting a capex test again.
   *
   * £100,000 funds exactly one upgrade with £25,000 left, so the bankruptcy
   * rule still has teeth after the buy. It is also the more realistic of the
   * two available fixes: £75k for a 350 kW unit is the researched figure, and
   * £50k of working capital for a six-bay corridor hub never was.
   */
  initialCash: 100_000,
  initialPricePerKwh: 0.79,
  initialConnectionFee: 0.99,
  initialTrust: 60,
  initialPowerPolicy: "equal_share",
  initialMaintenanceLevel: "standard",
  initialPartialChargeTargetSoc: undefined,

  energyCostPerKwh: 0.28,
  opexPerSimDay: 150,
  // Re-priced with the hardware: this is now a 150 kW → 350 kW swap, not
  // 50 → 150. IONITY's ~€700m for 5,000+ ultra-rapid chargers puts an all-in
  // greenfield unit near €140k; an in-place swap on a bay that already has its
  // groundwork and connection is cheaper, but not £40k cheap.
  upgradeCosts: [{ from: "rapid_dc", to: "ultrarapid_dc", capexCost: 75_000 }],

  // §4 — the designed problem-reveal beat. Timing is seed-independent, so the
  // target must be a fixed bay id, not "whichever is busier" (D20).
  scriptedFaults: [{ atSecond: 12.5 * H, bayId: "bay-5", category: "power_module_fault" }],

  /**
   * **Re-fitted (Mark, 2026-08-17) to the post-re-rating distribution.** The
   * old thresholds were set against 50 kW hardware and all four went slack at
   * once: margin was met on 20/20 seeds, and 110 sessions against a measured
   * 298–336 was not a goal at all.
   *
   * Re-set the way the originals were — from the measured baseline spread over
   * 20 seeds, picking round numbers rather than fitting to the decimal. Trust
   * is now the sharp constraint (the corridor is busy and reputation is what
   * pays for it); the other three are achievable but no longer free.
   *
   * Baseline spread at ×1.8: margin £2,545–£4,397 · trust 40.4–61.2 ·
   * wait 4.7–7.5 sim-min · sessions 298–336.
   *
   * `minTrust` deliberately stays at its original 55 — the re-rating moved
   * every other number but not what a good reputation is worth, and at 55 it
   * carries the difficulty floor on its own (met on 4/20).
   */
  goals: {
    // Re-fitted for D42/D43 (2026-08-19). Margin and sessions had both gone
    // free — met on 20/20 — because site-aware pricing lets the corridor charge
    // more for the same traffic. Re-set from the new 20-seed baseline spread
    // the way D36 set the last set: round numbers off the measured distribution,
    // not fitted to the decimal.
    //
    // Baseline spread: margin £3,169–£4,445 (p50 £3,453) · trust 41.4–57.6
    // (p50 49.8) · wait 5.5–7.5 sim-min (p50 6.6) · sessions 312–343 (p50 320).
    minOperatingMargin: 3_200,
    maxAvgWaitSeconds: 420,
    // Unchanged, and still the goal that bites: met on 4/20. D36 kept it at 55
    // through the last re-rating on the grounds that moving every other number
    // does not change what a good reputation is worth, and that holds here too.
    minTrust: 55,
    // 310 sits below the measured p10 of 312, so it was met on 20/20 — still
    // free. 320 is the median.
    minSessionsCompleted: 320,
  },
};
