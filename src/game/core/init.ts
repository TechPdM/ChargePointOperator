/**
 * Scenario → initial `SimulationState`. No wall-clock, no Math.random (C11/D26).
 */

import { CHARGER_SPECS } from "./calibration.ts";
import { Rng } from "./rng.ts";
import type {
  ChargerBay,
  DemandFunnel,
  ScenarioConfig,
  Site,
  SiteEconomics,
  SiteMetrics,
  SimulationState,
} from "./types.ts";

function emptyFunnel(): DemandFunnel {
  return {
    arrived: 0,
    rejectedSite: 0,
    siteFull: 0,
    queueJoined: 0,
    abandonedQueue: 0,
    sessionsStarted: 0,
    interruptedByFault: 0,
    completed: 0,
    closedAtRunEnd: 0,
  };
}

function initialMetrics(scenario: ScenarioConfig): SiteMetrics {
  return {
    trust: scenario.initialTrust,
    uptimePct: 100,
    utilizationPct: 0,
    powerUtilizationPct: 0,
    avgWaitSeconds: 0,
    queueLength: 0,
    abandonmentRatePct: 0,
    sessionsCompleted: 0,
    sessionsAbandoned: 0,
    kwhDelivered: 0,
    throughputVehiclesPerHour: 0,
    sessionSuccessRatePct: 100,
    chargeStartSuccessRatePct: 100,
    downtimeFaultSeconds: 0,
    downtimeRepairSeconds: 0,
    downtimeClosedSeconds: 0,
    openBaySeconds: 0,
    occupiedBaySeconds: 0,
    trustDeltaThisHour: 0,
    trustClampHits: 0,
    cumWaitSecondsSum: 0,
    cumStartedSessions: 0,
    funnel: emptyFunnel(),
    failureStatesActive: [],
    failureStatesObserved: [],
    activeAlerts: [],
  };
}

function initialEconomics(scenario: ScenarioConfig): SiteEconomics {
  return {
    cash: scenario.initialCash,
    revenueToday: 0,
    energyCostToday: 0,
    maintenanceCostToday: 0,
    opexAccruedToday: 0,
    capexSpentToday: 0,
  };
}

export function createInitialState(scenario: ScenarioConfig, seed: string): SimulationState {
  const chargers: Record<string, ChargerBay> = {};
  for (const entry of scenario.bays) {
    chargers[entry.id] = {
      id: entry.id,
      siteId: scenario.id,
      label: entry.label,
      spec: { ...CHARGER_SPECS[entry.type] },
      state: "idle",
      isOpen: true,
      allocatedPowerKw: 0,
      closeRequested: false,
      lifetimeSessions: 0,
      lifetimeKwh: 0,
    };
  }

  const site: Site = {
    id: scenario.id,
    name: scenario.name,
    maxBays: scenario.bays.length,
    openBayIds: scenario.bays.map((b) => b.id),
    gridPowerKw: scenario.initialGridPowerKw,
    availablePowerKw: scenario.initialGridPowerKw,
    policy: {
      pricePerKwh: scenario.initialPricePerKwh,
      connectionFee: scenario.initialConnectionFee,
      powerPolicy: scenario.initialPowerPolicy,
      maintenanceLevel: scenario.initialMaintenanceLevel,
      partialChargeTargetSoc: scenario.initialPartialChargeTargetSoc,
    },
    economics: initialEconomics(scenario),
    metrics: initialMetrics(scenario),
  };

  return {
    clock: {
      tick: 0,
      deltaSeconds: scenario.tickSeconds,
      secondsElapsed: 0,
      scenarioSecondsRemaining: scenario.durationSeconds,
    },
    scenario,
    rngState: Rng.fromSeed(seed).state,
    site,
    chargers,
    vehicles: {},
    queue: [],
    sessions: {},
    activeSessionIds: [],
    completedSessionIds: [],
    departedVehicleIds: [],
    pendingActions: [],
    eventLog: [],
    tickSamples: [],
    detectors: {
      failureEnterSince: {},
      failureLapseSince: {},
      failureClearSince: {},
      alertRaiseSince: {},
    },
    nextVehicleSeq: 1,
    nextSessionSeq: 1,
    paused: false,
    running: true,
  };
}
