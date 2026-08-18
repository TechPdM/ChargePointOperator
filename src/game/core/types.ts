/**
 * Canonical data model — Architecture §5.
 *
 * Rules that this file exists to enforce:
 *  - No wall-clock time anywhere in sim state (C11). Everything is SimSeconds.
 *  - SOC and other fractions are 0–1 here; `*_pct` conversion happens only at the
 *    log boundary (C6).
 *  - No field without a reader (Plan §6.5). If you add one, add its formula too.
 */

export type Id = string;
export type SimSeconds = number;

export type VehicleArchetype = "commuter" | "enroute" | "panic_low_soc";
export type ChargerType = "slow_ac" | "rapid_dc" | "ultrarapid_dc";
export type ChargerState = "idle" | "allocated" | "charging" | "faulted" | "repairing";
export type VehicleState =
  | "arriving"
  | "evaluating_site"
  | "queueing"
  | "charging"
  | "complete"
  | "left";

/** One vocabulary for departures, shared by sim and logs (C6, D18, D19). */
/**
 * What is kept of a vehicle once it has gone (D39).
 *
 * A departed `VehicleAgent` was read by nothing but the invariants, and `tick`
 * deep-clones the whole state every tick, so 420 of them by midnight were being
 * copied 1,440 times to be looked at twice. This is the flat subset anything
 * actually reads, plus the fields a later analysis would miss most: the wait the
 * driver *acted on*, and what they asked for versus what they left with.
 */
export interface DepartedVehicle {
  id: Id;
  archetype: VehicleArchetype;
  /** The terminal state the agent held, so the funnel split stays reconstructible. */
  outcome: "complete" | "left";
  leaveReason: QueueLeaveReason;
  arrivalSecond: SimSeconds;
  queuedAtSecond?: SimSeconds;
  chargingStartedAtSecond?: SimSeconds;
  leftAtSecond: SimSeconds;
  /** Perceived, not true — the figure admission actually judged on (D31). */
  expectedWaitSeconds?: number;
  requestedKwh: number;
  finalSoc: number;
}

export type QueueLeaveReason =
  | "completed"
  | "reject_site"
  | "site_full"
  | "queue_abandon"
  | "service_interrupted"
  | "scenario_end";

export type PowerPolicy = "equal_share" | "fast_first" | "queue_relief" | "manual";

export type FaultCategory =
  | "connector_fault"
  | "power_module_fault"
  | "cooling_fault"
  | "software_fault"
  | "unknown";

/** Detection-only (D24). These never end a run; hard fails live in `failRules`. */
export type FailureState =
  | "queue_collapse"
  | "power_choke"
  | "reliability_spiral"
  | "margin_trap"
  | "trust_crash";

export type AlertName =
  | "queue_overload"
  | "low_uptime"
  | "negative_margin"
  | "power_saturation"
  | "trust_collapse";

/** The canonical seven (C4 + D14). `add_bay` is deliberately absent — Phase 5. */
export type PlayerActionType =
  | "set_price"
  | "set_power_policy"
  | "toggle_bay_group"
  | "schedule_repair"
  | "set_maintenance_level"
  | "upgrade_charger"
  | "set_partial_charge_target";

export type MaintenanceLevel = "reactive" | "standard" | "preventive";

// ---------------------------------------------------------------------------
// Clock, demand, policy — §5.2
// ---------------------------------------------------------------------------

export interface GameClock {
  tick: number;
  deltaSeconds: number;
  secondsElapsed: SimSeconds;
  scenarioSecondsRemaining: SimSeconds;
}

export interface DemandWave {
  id: Id;
  startSecond: number;
  endSecond: number;
  arrivalRatePerMinute: number;
  commuterMix: number;
  enrouteMix: number;
  panicMix: number;
  /** IS the elasticity coefficient — there is no second global one (D21). */
  priceElasticity: number;
}

export interface SitePolicy {
  pricePerKwh: number;
  connectionFee: number;
  powerPolicy: PowerPolicy;
  maintenanceLevel: MaintenanceLevel;
  /** Fraction 0–1; undefined = off (D14). */
  partialChargeTargetSoc?: number;
  /** Per-bay kW, only read when powerPolicy === "manual" (D23). */
  manualAllocationsKw?: Record<Id, number>;
}

// ---------------------------------------------------------------------------
// Economics and metrics — §5.3
// ---------------------------------------------------------------------------

export interface SiteEconomics {
  cash: number;
  revenueToday: number;
  energyCostToday: number;
  maintenanceCostToday: number;
  opexAccruedToday: number;
  capexSpentToday: number;
}

/** Exactly one counter increments per vehicle terminal state (invariant 7). */
export interface DemandFunnel {
  arrived: number;
  rejectedSite: number;
  siteFull: number;
  queueJoined: number;
  abandonedQueue: number;
  sessionsStarted: number;
  interruptedByFault: number;
  completed: number;
  closedAtRunEnd: number;
}

/**
 * Per-tick raw samples. ROLL metrics are derived from these rather than from
 * mutated running averages (KPI dict, "Computation notes"). The ring holds
 * TICK_SAMPLE_WINDOW ticks — enough for both the 900 s ROLL window and the
 * 3,600 s trust clamp window.
 */
export interface TickSample {
  atSecond: SimSeconds;
  openBaySeconds: number;
  occupiedBaySeconds: number;
  faultSeconds: number;
  repairSeconds: number;
  sessionsStarted: number;
  sessionsCompleted: number;
  sessionsCompletedWithoutFault: number;
  queueAbandons: number;
  startedWaitSecondsSum: number;
  kwhDelivered: number;
  revenue: number;
  energyCost: number;
  maintenanceCost: number;
  opexAccrued: number;
  capex: number;
  allocatedPowerKw: number;
  queueLength: number;
  trustDelta: number;
}

export interface SiteMetrics {
  trust: number;
  uptimePct: number;
  utilizationPct: number;
  powerUtilizationPct: number;
  avgWaitSeconds: number;
  queueLength: number;
  abandonmentRatePct: number;
  sessionsCompleted: number;
  kwhDelivered: number;
  throughputVehiclesPerHour: number;

  /** completedWithoutFault / sessionsStarted (KPI dict is canonical). */
  sessionSuccessRatePct: number;
  /** sessionsStarted / (accepted − closedAtRunEnd). */
  chargeStartSuccessRatePct: number;

  downtimeFaultSeconds: number;
  downtimeRepairSeconds: number;
  downtimeClosedSeconds: number;

  openBaySeconds: number;
  occupiedBaySeconds: number;
  /** Sum of the trust deltas inside the rolling 3,600 s clamp window. */
  trustDeltaThisHour: number;
  /** Diagnostics: how often the ±5 clamp actually engaged (KPI dict). */
  trustClampHits: number;

  /** CUM avg-wait numerator/denominator (goal basis; ROLL is derived from samples). */
  cumWaitSecondsSum: number;
  cumStartedSessions: number;

  funnel: DemandFunnel;

  failureStatesActive: FailureState[];
  failureStatesObserved: FailureState[];
  activeAlerts: AlertName[];
}

export interface Site {
  id: Id;
  name: string;
  maxBays: number;
  /** Derived from ChargerBay.isOpen; the reducer keeps it in sync. */
  openBayIds: Id[];
  gridPowerKw: number;
  availablePowerKw: number;
  policy: SitePolicy;
  economics: SiteEconomics;
  metrics: SiteMetrics;
}

// ---------------------------------------------------------------------------
// Chargers and vehicles — §5.4
// ---------------------------------------------------------------------------

export interface ChargerSpec {
  type: ChargerType;
  maxPowerKw: number;
  /** Probability a session completes without a fault. */
  reliabilityBase: number;
  repairSecondsMean: number;
}

export interface ChargerBay {
  id: Id;
  siteId: Id;
  label: string;
  spec: ChargerSpec;
  state: ChargerState;
  isOpen: boolean;
  allocatedPowerKw: number;
  currentVehicleId?: Id;
  activeSessionId?: Id;
  faultedAtSecond?: SimSeconds;
  faultCategory?: FaultCategory;
  repairScheduledAtSecond?: SimSeconds;
  repairDueAtSecond?: SimSeconds;

  /** Latched transitions (D19) — applied when the bay next reaches `idle`. */
  closeRequested: boolean;
  pendingUpgradeType?: ChargerType;

  lifetimeSessions: number;
  lifetimeKwh: number;
}

export interface VehicleDemand {
  targetSoc: number;
  requestedKwh: number;
  maxAcceptablePricePerKwh: number;
  patienceSeconds: number;
}

export interface VehicleAgent {
  id: Id;
  archetype: VehicleArchetype;
  state: VehicleState;
  batteryCapacityKwh: number;
  /** Vehicle-side power cap (D15). */
  maxChargeRateKw: number;
  currentSoc: number;
  arrivalSecond: SimSeconds;
  urgencyScore: number;
  priceSensitivity: number;
  waitSensitivity: number;
  demand: VehicleDemand;
  expectedWaitSeconds?: number;
  queuedAtSecond?: SimSeconds;
  chargingStartedAtSecond?: SimSeconds;
  leftAtSecond?: SimSeconds;
  leaveReason?: QueueLeaveReason;
}

// ---------------------------------------------------------------------------
// Queue and sessions — §5.5
// ---------------------------------------------------------------------------

export interface QueueEntry {
  vehicleId: Id;
  queuedAtSecond: SimSeconds;
  predictedWaitSeconds: number;
  preferredChargerTypes: ChargerType[];
}

export interface ChargingSession {
  id: Id;
  siteId: Id;
  vehicleId: Id;
  chargerBayId: Id;
  startedAtSecond: SimSeconds;
  updatedAtSecond: SimSeconds;
  endedAtSecond?: SimSeconds;
  requestedKwh: number;
  deliveredKwh: number;
  targetSoc: number;
  effectivePowerKw: number;
  pricePerKwh: number;
  connectionFee: number;
  estimatedDurationSeconds: number;
  actualDurationSeconds?: number;
  completed: boolean;
  interruptedByFault: boolean;
  /** Frozen at session start; the fault model's per-tick divisor (Calibration §5). */
  expectedSessionTicks: number;
  /** True when site policy capped this session below the driver's own target (D14). */
  partialChargeCapped: boolean;
}

// ---------------------------------------------------------------------------
// Player actions — §5.6
// ---------------------------------------------------------------------------

export interface PlayerActionBase {
  id: Id;
  tick: number;
  atSecond: SimSeconds;
  type: PlayerActionType;
}

export interface SetPriceAction extends PlayerActionBase {
  type: "set_price";
  pricePerKwh: number;
  connectionFee?: number;
}

export interface SetPowerPolicyAction extends PlayerActionBase {
  type: "set_power_policy";
  powerPolicy: PowerPolicy;
  manualAllocationsKw?: Record<Id, number>;
}

export interface ToggleBayGroupAction extends PlayerActionBase {
  type: "toggle_bay_group";
  bayIds: Id[];
  open: boolean;
}

export interface ScheduleRepairAction extends PlayerActionBase {
  type: "schedule_repair";
  chargerBayId: Id;
}

export interface SetMaintenanceLevelAction extends PlayerActionBase {
  type: "set_maintenance_level";
  level: MaintenanceLevel;
}

export interface UpgradeChargerAction extends PlayerActionBase {
  type: "upgrade_charger";
  chargerBayId: Id;
  newType: ChargerType;
  /** No capexCost field — resolved from scenario.upgradeCosts at reduce time (D20). */
}

export interface SetPartialChargeTargetAction extends PlayerActionBase {
  type: "set_partial_charge_target";
  /** Fraction 0–1; null = off (JSON-serialisable off-state). */
  targetSoc: number | null;
}

/**
 * A distributive Omit — a plain `Omit<PlayerAction, …>` over a discriminated
 * union collapses to the keys they all share, which loses every payload field.
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** An action before the reducer stamps it with id/tick/atSecond. */
export type PlayerActionDraft = DistributiveOmit<PlayerAction, "id" | "tick" | "atSecond">;

export type PlayerAction =
  | SetPriceAction
  | SetPowerPolicyAction
  | ToggleBayGroupAction
  | ScheduleRepairAction
  | SetMaintenanceLevelAction
  | UpgradeChargerAction
  | SetPartialChargeTargetAction;

// ---------------------------------------------------------------------------
// Scenario and root state — §5.7
// ---------------------------------------------------------------------------

export interface ScenarioGoals {
  minTrust: number;
  minOperatingMargin: number;
  maxAvgWaitSeconds: number;
  minSessionsCompleted: number;
}

export interface FailRules {
  bankruptcyCashBelow: number;
  trustBelow: number;
  trustBelowForSeconds: SimSeconds;
}

export interface BayRosterEntry {
  id: Id;
  label: string;
  type: ChargerType;
}

export interface ScriptedFault {
  atSecond: SimSeconds;
  bayId: Id;
  category: FaultCategory;
}

export interface UpgradeCost {
  from: ChargerType;
  to: ChargerType;
  capexCost: number;
}

export interface ScenarioConfig {
  id: Id;
  name: string;
  archetype: "corridor_hub" | "commuter_hub" | "destination_site";
  durationSeconds: number;
  /** The ONLY source of deltaSeconds (D26). */
  tickSeconds: number;
  demandWaves: DemandWave[];
  referencePricePerKwh: number;

  bays: BayRosterEntry[];
  initialGridPowerKw: number;
  maxQueueLength: number;

  initialCash: number;
  initialPricePerKwh: number;
  initialConnectionFee: number;
  initialTrust: number;
  initialPowerPolicy: PowerPolicy;
  initialMaintenanceLevel: MaintenanceLevel;
  initialPartialChargeTargetSoc?: number;

  /**
   * Site-level modifiers on driver behaviour (Phase 3). A destination site is
   * somewhere people leave the car and go and do something else, so they wait
   * far longer and arrive less desperate; a corridor hub is the opposite. Both
   * default to 1 and are the axes the patience sweep moves.
   */
  patienceMultiplier?: number;
  urgencyMultiplier?: number;

  energyCostPerKwh: number;
  opexPerSimDay: number;
  upgradeCosts: UpgradeCost[];

  scriptedFaults: ScriptedFault[];
  goals: ScenarioGoals;
  failRules: FailRules;
}

/**
 * Detector bookkeeping for the sustained-duration conditions in the KPI
 * dictionary (failure states + alerts). Kept in state so replay reproduces
 * detection exactly; excluded from nothing — it is real state.
 */
export interface DetectorState {
  failureEnterSince: Partial<Record<FailureState, SimSeconds>>;
  /** When the enter condition last lapsed — see FAILURE_ENTER_GRACE_SECONDS. */
  failureLapseSince: Partial<Record<FailureState, SimSeconds>>;
  failureClearSince: Partial<Record<FailureState, SimSeconds>>;
  alertRaiseSince: Partial<Record<AlertName, SimSeconds>>;
  /** Seconds trust has been continuously below failRules.trustBelow. */
  trustBelowFailSince?: SimSeconds;
}

export interface SimulationState {
  clock: GameClock;
  scenario: ScenarioConfig;
  /** mulberry32 uint32 as 8 lowercase hex chars (D26). */
  rngState: string;
  site: Site;
  chargers: Record<Id, ChargerBay>;
  vehicles: Record<Id, VehicleAgent>;
  queue: QueueEntry[];
  sessions: Record<Id, ChargingSession>;
  activeSessionIds: Id[];
  completedSessionIds: Id[];
  /**
   * Vehicles that have left, as flat records rather than live agents (D39).
   * `vehicles` holds only who is still on site.
   */
  departedVehicles: DepartedVehicle[];
  pendingActions: PlayerAction[];
  /** In-memory ring for the UI panel; excluded from the state hash (D26). */
  eventLog: SimEventRingEntry[];
  /** Ring of per-tick samples backing all ROLL metrics. */
  tickSamples: TickSample[];
  detectors: DetectorState;
  /** Monotonic counters so ids never depend on wall-clock or Math.random. */
  nextVehicleSeq: number;
  nextSessionSeq: number;
  paused: boolean;
  running: boolean;
  result?: "success" | "fail";
  resultReason?: string;
}

/** Compact form kept in state; the full typed event lives in logging/schema.ts. */
export interface SimEventRingEntry {
  atSecond: SimSeconds;
  tick: number;
  level: "debug" | "info" | "warn" | "error";
  name: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Derived selectors — §5.8
// ---------------------------------------------------------------------------

export interface DerivedSiteState {
  occupiedBayCount: number;
  idleBayCount: number;
  faultedBayCount: number;
  totalOpenBayCount: number;
  totalAllocatedPowerKw: number;
  sparePowerKw: number;
  projectedWaitSeconds: number;
}
