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

export const CHARGER_SPECS: Record<ChargerType, ChargerSpec> = {
  slow_ac: { type: "slow_ac", maxPowerKw: 22, reliabilityBase: 0.99, repairSecondsMean: 1_800 },
  rapid_dc: { type: "rapid_dc", maxPowerKw: 50, reliabilityBase: 0.985, repairSecondsMean: 2_700 },
  ultrarapid_dc: {
    type: "ultrarapid_dc",
    maxPowerKw: 150,
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
  /** Hard rejection, applied on top of siteScore. */
  maxAcceptablePricePerKwh: number;
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
    maxAcceptablePricePerKwh: 0.95,
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
    maxAcceptablePricePerKwh: 1.1,
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
    maxAcceptablePricePerKwh: 1.5,
  },
};

/** Two-segment taper (A1/D14): full power below 0.80 SOC, 40 % at or above. */
export const TAPER_KNEE_SOC = 0.8;
export const TAPER_ABOVE_KNEE = 0.4;
export function taper(soc: number): number {
  return soc >= TAPER_KNEE_SOC ? TAPER_ABOVE_KNEE : 1.0;
}

/** Options offered by ChargingPolicyPanel (D14). */
export const PARTIAL_CHARGE_OPTIONS = [null, 0.9, 0.8, 0.7] as const;

// --- §4 Pricing & economics -------------------------------------------------

export const PRICE_MIN = 0.45;
export const PRICE_MAX = 1.2;

export interface MaintenanceProfile {
  standingCostPerSimDay: number;
  costPerRepair: number;
  faultProbabilityMultiplier: number;
  repairTimeMultiplier: number;
}

export const MAINTENANCE: Record<MaintenanceLevel, MaintenanceProfile> = {
  reactive: {
    standingCostPerSimDay: 0,
    costPerRepair: 300,
    faultProbabilityMultiplier: 1.25,
    repairTimeMultiplier: 1.2,
  },
  standard: {
    standingCostPerSimDay: 25,
    costPerRepair: 200,
    faultProbabilityMultiplier: 1.0,
    repairTimeMultiplier: 1.0,
  },
  // OPEN-2: currently cost-dominant. Deliberately not silently repriced.
  preventive: {
    standingCostPerSimDay: 45,
    costPerRepair: 150,
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

export const TRUST = {
  min: 0,
  max: 100,
  /** Max net movement inside a rolling TRUST_WINDOW_SECONDS. */
  clampPerWindow: 5,
  abandon: -1.5,
  faultMidSession: -2.0,
  faultIdle: -0.5,
  completion: 0.1,
  /** Cumulative with `completion` — a fast completion is +0.4 total. */
  fastCompletionBonus: 0.3,
  fastCompletionWaitSeconds: 300,
  /** Awarded per sim-hour while ROLL uptime stays above the threshold. */
  uptimeBonusPerSimHour: 0.5,
  uptimeBonusThresholdPct: 95,
  priceRejection: -0.05,
  partialChargeCapped: -0.1,
} as const;

/** Mean service time used by the wait projection before any session exists. */
export const FALLBACK_SESSION_SECONDS = 1_400;

// --- KPI dictionary: failure-state detection (D24) --------------------------

export interface FailureStateRule {
  /** How long the enter condition must hold. */
  sustainSeconds: number;
  /** How long the clear condition must hold. */
  clearSeconds: number;
}

export const FAILURE_RULES: Record<FailureState, FailureStateRule> = {
  queue_collapse: { sustainSeconds: 1_800, clearSeconds: 900 },
  power_choke: { sustainSeconds: 1_800, clearSeconds: 900 },
  reliability_spiral: { sustainSeconds: 3_600, clearSeconds: 900 },
  margin_trap: { sustainSeconds: 0, clearSeconds: Number.POSITIVE_INFINITY },
  trust_crash: { sustainSeconds: 0, clearSeconds: 0 },
};

export const FAILURE_THRESHOLDS = {
  queueCollapsePressure: 2.0,
  queueCollapseAbandonmentPct: 30,
  queueCollapseClearPressure: 1.2,
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
  queueOverloadPressure: 1.5,
  queueOverloadClearPressure: 1.0,
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
