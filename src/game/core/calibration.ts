/**
 * Calibration constants — the code-side mirror of
 * `ChargePointOperator_Calibration.md` v2.2.
 *
 * STATUS OF EVERY NUMBER: FIRST GUESS. When one proves wrong, change it in the
 * calibration sheet first, then here. Architecture deliberately holds no tuning
 * numbers; this file is where they live.
 */

import type {
  AlertName,
  ChargerSpec,
  ChargerType,
  FailureState,
  MaintenanceLevel,
  VehicleArchetype,
} from "./types.ts";

// --- §1 Time & scale --------------------------------------------------------

export const TICK_SECONDS = 60;
export const SCENARIO_DURATION_SECONDS = 86_400;
export const SNAPSHOT_CADENCE_SECONDS = 300;
/** KPI dictionary: ROLL = last 900 sim-seconds. */
export const ROLL_WINDOW_SECONDS = 900;
/** Trust clamp window (rolling, not bucketed). */
export const TRUST_WINDOW_SECONDS = 3_600;
/** Long enough for both windows above, at 60 s/tick. */
export const TICK_SAMPLE_WINDOW = TRUST_WINDOW_SECONDS / TICK_SECONDS;
/** How many events the in-state ring keeps for the UI panel. */
export const EVENT_RING_SIZE = 400;

// --- §2 Site & hardware -----------------------------------------------------

/**
 * **Re-rated to current hardware (Mark, 2026-08-17).** The old 50 kW rapid /
 * 150 kW ultra-rapid pair was 2019–2021 spec and had drifted a full generation
 * behind the fleet: driver archetypes already accept 60–250 kW (below), so a
 * 50 kW "rapid" bay throttled every car on site, including the ones the taper
 * model exists to describe.
 *
 * Current UK classification puts rapid at 100–150 kW (50 kW is the legacy tier)
 * and ultra-rapid at 150 kW upwards, with the corridor sites this scenario
 * models — Ionity, GRIDSERVE/Extra — running 350–400 kW units.
 *
 * `slow_ac` is unchanged: 22 kW is still the top of the AC range and destination
 * posts really do sit at 7/11/22 kW.
 */
export const CHARGER_SPECS: Record<ChargerType, ChargerSpec> = {
  slow_ac: { type: "slow_ac", maxPowerKw: 22, reliabilityBase: 0.99, repairSecondsMean: 1_800 },
  rapid_dc: { type: "rapid_dc", maxPowerKw: 150, reliabilityBase: 0.985, repairSecondsMean: 2_700 },
  ultrarapid_dc: {
    type: "ultrarapid_dc",
    maxPowerKw: 350,
    reliabilityBase: 0.975,
    repairSecondsMean: 3_600,
  },
};

// --- §3 Vehicles & demand behaviour ----------------------------------------

export interface ArchetypeProfile {
  batteryKwh: [number, number];
  maxChargeRateKw: [number, number];
  arrivalSoc: [number, number];
  targetSoc: number;
  patienceSeconds: number;
  priceSensitivity: number;
  waitSensitivity: number;
  urgency: [number, number];
  /** Where this archetype starts grumbling about price (D21). */
  referencePricePerKwh: number;
  /**
   * What they would pay with a competing charger **right there** — no detour,
   * no captivity (D42). The situational part is added per driver at spawn, so
   * this is a floor on the hard rejection rather than the rejection itself.
   *
   * Derived, not chosen: each base is the old ceiling minus the premium a
   * Junction-42-typical detour (19 sim-min) buys for that archetype at its
   * mid-range energy demand. The corridor therefore keeps the tolerance it
   * already had, and the differentiation comes from the other two sites being
   * less captive — the honest direction, since the corridor's pricing power was
   * never the anomaly.
   */
  maxAcceptablePriceBase: number;
  /**
   * DfT, *Provision of market research for value of travel time savings and
   * reliability*, Aug 2015, Table 5.1 — **2014 perceived prices, £/hr**.
   * Commute £11.21, other non-work £5.12.
   *
   * Perceived prices, not market or factor prices, is the right basis: this
   * stands in for what a driver believes their own time is worth while deciding
   * whether to drive on, which is exactly what a perceived-price VTT measures.
   *
   * Not uprated from 2014 — no uprating factor has been sourced, and leaving it
   * understates premiums, which is the conservative direction. §9 register.
   */
  valueOfTimePerHour: number;
}

export const ARCHETYPES: Record<VehicleArchetype, ArchetypeProfile> = {
  commuter: {
    batteryKwh: [40, 80],
    maxChargeRateKw: [60, 120],
    arrivalSoc: [0.35, 0.55],
    targetSoc: 0.8,
    patienceSeconds: 900,
    priceSensitivity: 0.7,
    waitSensitivity: 0.6,
    urgency: [0.3, 0.5],
    referencePricePerKwh: 0.75,
    // Was 0.95. 0.95 − premium(19 min, £11.21/hr, 21.0 kWh mid demand) = 0.78.
    maxAcceptablePriceBase: 0.78,
    // DfT VTT Table 5.1, commute.
    valueOfTimePerHour: 11.21,
  },
  enroute: {
    batteryKwh: [50, 80],
    maxChargeRateKw: [120, 250],
    arrivalSoc: [0.15, 0.35],
    targetSoc: 0.8,
    patienceSeconds: 1_200,
    priceSensitivity: 0.4,
    waitSensitivity: 0.5,
    urgency: [0.5, 0.7],
    referencePricePerKwh: 0.85,
    // Was 1.10. 1.10 − premium(19 min, £5.12/hr, 35.8 kWh mid demand) = 1.05.
    maxAcceptablePriceBase: 1.05,
    // DfT VTT Table 5.1, other non-work.
    valueOfTimePerHour: 5.12,
  },
  panic_low_soc: {
    batteryKwh: [40, 70],
    maxChargeRateKw: [50, 150],
    arrivalSoc: [0.03, 0.12],
    targetSoc: 0.6,
    patienceSeconds: 1_800,
    priceSensitivity: 0.1,
    waitSensitivity: 0.2,
    urgency: [0.9, 1.0],
    referencePricePerKwh: 1.0,
    // Was 1.50. 1.50 − premium(19 min, £5.12/hr, 28.9 kWh mid demand) = 1.44.
    // Still by far the highest base: their alternative may not be reachable at
    // all, and that is what the base carries rather than the detour premium.
    maxAcceptablePriceBase: 1.44,
    valueOfTimePerHour: 5.12,
  },
};

/** Two-segment taper (A1/D14): full power below 0.80 SOC, 40 % at or above. */
export const TAPER_KNEE_SOC = 0.8;
export const TAPER_ABOVE_KNEE = 0.4;
export function taper(soc: number): number {
  return soc >= TAPER_KNEE_SOC ? TAPER_ABOVE_KNEE : 1.0;
}

/**
 * Options offered by ChargingPolicyPanel (D14), **re-scoped under OPEN-2/OPEN-6**
 * (Mark, 2026-08-16) from off/0.90/0.80/0.70.
 *
 * Every driver already targets 0.80 or less, so the old 0.90 and 0.80 settings
 * were exact no-ops — measured identical to "off" across 20 seeds, to the last
 * decimal. Three dead settings on a live control is a legibility bug in a build
 * whose gate criterion is legibility. The range below 0.80 is where the
 * mechanic actually lives: at ×1.6 demand, off/70/60/50% gives 203/215/265/330
 * sessions at 30.4/24.9/19.5/12.6 kWh each.
 */
export const PARTIAL_CHARGE_OPTIONS = [null, 0.7, 0.6, 0.5] as const;

// --- §4 Pricing & economics -------------------------------------------------

export const PRICE_MIN = 0.45;
export const PRICE_MAX = 1.2;

/**
 * Ceiling on the detour premium (D42).
 *
 * The premium divides a fixed detour cost by the energy the driver actually
 * wants, which is the honest economics — a 10 kWh top-up really does justify a
 * bigger per-kWh premium than a 40 kWh fill. But the archetype ranges allow
 * top-ups as small as 10 kWh, and at the top of a corridor detour range that
 * produces premiums above £1/kWh — wider than the entire price range.
 *
 * **MEASURED and kept at 0.40** (2026-08-19, 5 seeds × 3 scenarios, n=3,893).
 * It binds on 0.60% of corridor drivers (13 of 2,174) and on nobody at all at
 * the other two sites, where the largest premium reached is £0.266 and £0.117.
 * That is what this constant should be doing: catching the extreme tail — a
 * 10 kWh top-up after a 30-minute detour — without collapsing anyone onto a
 * shared ceiling. Set it much lower and the cliff this change exists to remove
 * comes back; much higher and it is inert.
 */
export const DETOUR_PREMIUM_MAX = 0.4;

export interface MaintenanceProfile {
  standingCostPerSimDay: number;
  costPerRepair: number;
  faultProbabilityMultiplier: number;
  repairTimeMultiplier: number;
}

/**
 * OPEN-2, option 2 (Mark, 2026-08-16): **the per-repair cost is flat across
 * tiers**. The tiers now differ only on how often things break and how fast
 * they are fixed — not on what a call-out costs.
 *
 * Phase 3 measured preventive winning on all three archetypes and traced part
 * of it to the repair-price ladder (£300/£200/£150), which paid preventive
 * twice: fewer faults *and* a discount on each one. Flattening removes the
 * double-count. Whether it removes the dominance is an empirical question —
 * see the measurement in the Phase 3 findings.
 */
export const REPAIR_CALL_OUT_COST = 200;

export const MAINTENANCE: Record<MaintenanceLevel, MaintenanceProfile> = {
  reactive: {
    standingCostPerSimDay: 0,
    costPerRepair: REPAIR_CALL_OUT_COST,
    faultProbabilityMultiplier: 1.25,
    repairTimeMultiplier: 1.2,
  },
  standard: {
    standingCostPerSimDay: 25,
    costPerRepair: REPAIR_CALL_OUT_COST,
    faultProbabilityMultiplier: 1.0,
    repairTimeMultiplier: 1.0,
  },
  preventive: {
    /**
     * £150/day = £55k/year = **£9.1k per bay per year**, which is a normal
     * price for a comprehensive O&M contract with scheduled servicing on DC
     * rapid hardware. The old £45/day was £2.7k per bay — cheap even for a
     * basic break-fix agreement, let alone a preventive one.
     *
     * This is the second half of OPEN-2 option 2, and it only became available
     * once the repair ladder was flattened. The earlier estimate said preventive
     * would need ~£460/day to break even, which genuinely did break D10's
     * realism commitment — but that figure was computed while preventive was
     * *also* getting a discount on every call-out. Removing the double-count
     * cut the break-even by two thirds and brought it inside realistic pricing.
     */
    standingCostPerSimDay: 150,
    costPerRepair: REPAIR_CALL_OUT_COST,
    faultProbabilityMultiplier: 0.5,
    repairTimeMultiplier: 0.7,
  },
};

/** Elasticity: the wave's own coefficient is the only one (D21). */
export const PRICE_MULTIPLIER_MIN = 0.3;
export const PRICE_MULTIPLIER_MAX = 1.5;

// --- §5 Behavioural & system constants -------------------------------------

export const SITE_SCORE = {
  /** urgency */
  a: 2.0,
  /** wait, per 600 s */
  b: 1.0,
  /** price, per £0.10 over the archetype reference */
  c: 0.8,
  /** trust, per 25 points over 50 */
  d: 0.3,
} as const;
export const ACCEPT_THRESHOLD = 0.15;

/** Abandonment: nothing until patience is spent, then a linear ramp. */
export const ABANDON_RAMP_SECONDS = 600;
export const ABANDON_MAX_PROBABILITY_PER_TICK = 0.5;

/**
 * Trust deltas — **rebalanced under D30.**
 *
 * The v2.2 set was net-positive by ~+42/day under baseline play, so trust ran
 * to the 0–100 ceiling on every competent run and stopped being a resource at
 * all. Measured event volumes are what fixed it: a day has ~183 completions
 * against ~10 failures, so *any* per-completion reward swamps every penalty.
 *
 * The structure now is: serving someone is the job, not a favour. Reputation
 * moves on the exceptional — a plug free on arrival — and on the things that
 * actually annoy people: a long wait, a fault, giving up, and driving past a
 * site that looked too busy to bother with.
 */
export const TRUST = {
  min: 0,
  max: 100,
  /** Max net movement inside a rolling TRUST_WINDOW_SECONDS. */
  clampPerWindow: 5,
  abandon: -1.5,
  faultMidSession: -2.0,
  faultIdle: -0.5,
  /** D30: was +0.1. Completing a session is the baseline expectation. */
  completion: 0,
  /** Served with little or no wait — the experience worth talking about. */
  fastCompletionBonus: 0.1,
  fastCompletionWaitSeconds: 300,
  /**
   * NEW (D30): served, but kept waiting. Before this, wait touched trust only
   * when someone gave up — so a site with 20-minute queues that everyone
   * tolerated lost no reputation at all.
   */
  slowCompletionPenalty: -0.05,
  /** Awarded per sim-hour while ROLL uptime stays above the threshold. */
  uptimeBonusPerSimHour: 0.5,
  /** D30: was 95%, which is ordinary. 98% is a site that genuinely never breaks. */
  uptimeBonusThresholdPct: 98,
  /**
   * D30: was −0.05. A driver who sees the queue and drives on is a reputation
   * event, not a rounding error — and it is where 18% of the day's demand goes.
   */
  /**
   * Any driver who looks at the site and drives on, whatever the reason —
   * a queue they will not join, a price they will not pay, a day when they are
   * simply not desperate enough. Reputation is what people say about you, and
   * "I pulled in and pulled straight back out" is a thing people say.
   *
   * Renamed from `priceRejection` (D45): it always fired on every rejection,
   * not just price ones, and the old name hid that. The price-specific part is
   * now a separate, additional penalty below.
   */
  siteRejection: -0.15,
  /**
   * **On top of `siteRejection`, and only when the price exceeded what that
   * driver would pay (D45).** Being too dear is a different reputational injury
   * from being busy: a queue is bad luck, a price is a decision you made.
   *
   * This exists because criterion 2 needs a site where premium pricing is
   * punished, and margin alone could not do it — `premium+preventive` fails
   * Eastgate's margin goal on 40/40 seeds and still nearly wins, because
   * serving half as many drivers wins the wait goal outright.
   *
   * An earlier attempt simply doubled the old blanket penalty. It worked at
   * Eastgate and wrecked the other two sites — trust fell to a 5%-met wall on
   * both, because it also taxed drivers leaving long queues, which is what
   * Kesteven's drive-ons mostly are. Splitting the two is what makes the
   * penalty land on the behaviour it is meant to be about.
   *
   * **MEASURED at -0.2, -0.4 and -0.7** (20 seeds × 3 scenarios). The effect at
   * Eastgate is a step, not a curve: the separation is +1.15 goals at -0.2 and
   * identical at -0.4 and -0.7. So this is the smallest value that does the
   * job, not the value that maximised anything — which matters, because the
   * last constant chosen by looking for a maximum is what broke criterion 2
   * three commits ago.
   *
   * Two further measurements decided it. Baseline trust is **unchanged** at
   * every value tested (49.7 / 62.8 / 62.2), because baseline play prices below
   * what drivers will pay and so never triggers this at all — the penalty is
   * invisible until you reach for premium pricing, which is the point. And at
   * -0.7 the corridor's ordering flips, which risks handing dominance to a
   * different strategy; at -0.2 it is untouched.
   */
  priceRejectionExtra: -0.2,
  partialChargeCapped: -0.1,
} as const;

/**
 * OPEN-5 / A4: drivers judge the wait they can see, and they misjudge it.
 *
 * With perfect information every arrival read the true projected wait and drove
 * on, so the queue capped itself at ~5 of 12 and abandonment measured 2.4%
 * against an expected 8–25%. A4 always allowed for this ("add noise to
 * expectedWait if admission feels twitchy"); this is that noise. Perceived wait
 * is scaled by a uniform draw in [1−WAIT_PERCEPTION_NOISE, 1+…].
 */
export const WAIT_PERCEPTION_NOISE = 0.35;

/** Mean service time used by the wait projection before any session exists. */
export const FALLBACK_SESSION_SECONDS = 1_400;

// --- KPI dictionary: failure-state detection (D24) --------------------------

export interface FailureStateRule {
  /** How long the enter condition must hold. */
  sustainSeconds: number;
  /** How long the clear condition must hold. */
  clearSeconds: number;
}

/**
 * D31: how long the enter condition may lapse before the sustain clock resets.
 *
 * Without this, a single tick where the condition dips wipes out half an hour
 * of genuine collapse — and the conditions *do* flicker, because ROLL
 * abandonment moves every time one session starts. Measured: both
 * `queue_collapse` conditions held for 3–17 consecutive ticks against a
 * 30-tick requirement, but for 17–49 ticks in total across the same window.
 * The KPI dictionary already argues this case for alerts ("flapping destroys
 * the legibility the whole design depends on"); it applies to entering a
 * failure state just as much as to leaving one.
 */
export const FAILURE_ENTER_GRACE_SECONDS = 300;

export const FAILURE_RULES: Record<FailureState, FailureStateRule> = {
  queue_collapse: { sustainSeconds: 1_800, clearSeconds: 900 },
  power_choke: { sustainSeconds: 1_800, clearSeconds: 900 },
  reliability_spiral: { sustainSeconds: 3_600, clearSeconds: 900 },
  margin_trap: { sustainSeconds: 0, clearSeconds: Number.POSITIVE_INFINITY },
  trust_crash: { sustainSeconds: 0, clearSeconds: 0 },
};

export const FAILURE_THRESHOLDS = {
  /**
   * D31: was 2.0, set on paper. Measured: with six bays and a queue capacity of
   * 12, pressure 2.0 needs the queue *exactly full*, and even 1.2 never holds
   * long enough to fire. Threshold set from the joint distribution instead —
   * across 5 seeds, the longest window where pressure and sustained
   * abandonment both held was 0 ticks under baseline at every combination
   * tried, and 44 ticks at pressure ≥ 1.0 with abandonment ≥ 30%. So 1.0 both
   * never fires on a competent run and fires reliably on a real mistake.
   *
   * It also reads plainly: a car queued for every bay you own, and a third of
   * the people who committed walking away, for half an hour.
   */
  queueCollapsePressure: 1.0,
  queueCollapseAbandonmentPct: 30,
  queueCollapseClearPressure: 0.7,
  powerChokeAllocatedPct: 95,
  powerChokeQueueLength: 3,
  powerChokeClearPct: 85,
  reliabilitySpiralUptimePct: 85,
  reliabilitySpiralBaysDown: 3,
  reliabilitySpiralClearUptimePct: 90,
  trustCrashBelow: 40,
  trustCrashFallingOverSeconds: 1_800,
  trustCrashClearAt: 45,
} as const;

// --- KPI dictionary: alert thresholds --------------------------------------

export interface AlertRule {
  sustainSeconds: number;
}

export const ALERT_RULES: Record<AlertName, AlertRule> = {
  queue_overload: { sustainSeconds: 300 },
  low_uptime: { sustainSeconds: 0 },
  negative_margin: { sustainSeconds: 900 },
  power_saturation: { sustainSeconds: 300 },
  trust_collapse: { sustainSeconds: 0 },
};

export const ALERT_THRESHOLDS = {
  // Kept below the failure-state entry so the alert is a genuine early warning
  // of the same condition: 5 minutes of pressure here, half an hour of pressure
  // plus abandonment there.
  queueOverloadPressure: 1.0,
  queueOverloadClearPressure: 0.7,
  lowUptimePct: 90,
  lowUptimeClearPct: 93,
  /** −£25, not £0: quiet overnight ROLL windows legitimately run slightly negative. */
  negativeMarginAmount: -25,
  negativeMarginClearAmount: 0,
  powerSaturationPct: 95,
  powerSaturationClearPct: 85,
  trustCollapseBelow: 40,
  trustCollapseClearAt: 45,
} as const;
