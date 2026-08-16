/**
 * Derived state — Architecture §5.8. Computed on read, never stored.
 *
 * The ROLL helpers here are the single implementation of the KPI dictionary's
 * 900-second window; sim, logs and dashboard all read through them so the three
 * cannot drift.
 */

import { FALLBACK_SESSION_SECONDS, ROLL_WINDOW_SECONDS, taper } from "./calibration.ts";
import { bayList } from "./context.ts";
import type {
  ChargerBay,
  DemandWave,
  DerivedSiteState,
  SimulationState,
  VehicleAgent,
} from "./types.ts";

// --- bay predicates ---------------------------------------------------------

/** A bay that can take a new vehicle right now. Latched bays cannot (D19). */
export function isAssignable(bay: ChargerBay): boolean {
  return (
    bay.state === "idle" &&
    bay.isOpen &&
    !bay.closeRequested &&
    bay.pendingUpgradeType === undefined
  );
}

export function isBusy(bay: ChargerBay): boolean {
  return bay.state === "allocated" || bay.state === "charging";
}

export function isDown(bay: ChargerBay): boolean {
  return bay.state === "faulted" || bay.state === "repairing";
}

/**
 * A5 (universal connector compatibility) makes this an identity filter. It is
 * kept as the seam where a CCS/AC split would land.
 */
export function isCompatible(_vehicle: VehicleAgent, _bay: ChargerBay): boolean {
  return true;
}

export function getCompatibleIdleBays(vehicle: VehicleAgent, state: SimulationState): ChargerBay[] {
  return bayList(state).filter((b) => isAssignable(b) && isCompatible(vehicle, b));
}

/** Power a bay could draw for its current vehicle, before the pool is split. */
export function bayCeilingKw(state: SimulationState, bay: ChargerBay): number {
  if (!bay.activeSessionId || !bay.currentVehicleId) return 0;
  const vehicle = state.vehicles[bay.currentVehicleId];
  if (!vehicle) return 0;
  return Math.min(bay.spec.maxPowerKw, vehicle.maxChargeRateKw) * taper(vehicle.currentSoc);
}

// --- demand -----------------------------------------------------------------

export function getActiveWave(
  secondsElapsed: number,
  waves: readonly DemandWave[],
): DemandWave | undefined {
  return waves.find((w) => secondsElapsed >= w.startSecond && secondsElapsed < w.endSecond);
}

// --- wait projection --------------------------------------------------------

/**
 * Shortest-job-first projection over the bays a waiting vehicle could use.
 *
 * Each free-able bay is given its estimated remaining seconds (0 if it is idle
 * and assignable); the queue is then walked in order, each vehicle taking the
 * soonest-free bay and pushing that bay's next free time out by a mean service
 * time. The result is the wait an arriving vehicle would face if it joined the
 * back of the queue.
 */
export function getProjectedWait(state: SimulationState, queueAhead: number): number {
  const bays = bayList(state).filter((b) => b.isOpen && !isDown(b) && !b.closeRequested);
  if (bays.length === 0) return Number.POSITIVE_INFINITY;

  const freeAt: number[] = [];
  let knownDurations = 0;
  let knownSum = 0;

  for (const bay of bays) {
    if (isBusy(bay) && bay.activeSessionId) {
      const session = state.sessions[bay.activeSessionId];
      if (session) {
        const remainingKwh = Math.max(0, session.requestedKwh - session.deliveredKwh);
        const power = Math.max(1, bay.allocatedPowerKw || bayCeilingKw(state, bay));
        const remaining = (remainingKwh / power) * 3_600;
        freeAt.push(remaining);
        knownSum += session.estimatedDurationSeconds;
        knownDurations += 1;
        continue;
      }
    }
    freeAt.push(0);
  }

  const meanService = knownDurations > 0 ? knownSum / knownDurations : FALLBACK_SESSION_SECONDS;

  // Walk everyone already waiting, then the arriving vehicle itself.
  for (let i = 0; i < queueAhead; i++) {
    const soonest = minIndex(freeAt);
    const t = freeAt[soonest] ?? 0;
    freeAt[soonest] = t + meanService;
  }
  const soonest = minIndex(freeAt);
  return Math.max(0, freeAt[soonest] ?? 0);
}

function minIndex(values: readonly number[]): number {
  let best = 0;
  let bestValue = values[0] ?? 0;
  for (let i = 1; i < values.length; i++) {
    const v = values[i] ?? 0;
    if (v < bestValue) {
      best = i;
      bestValue = v;
    }
  }
  return best;
}

/** Estimated seconds until this bay's session finishes — `queue_relief` ordering. */
export function estimatedRemainingSeconds(state: SimulationState, bay: ChargerBay): number {
  if (!bay.activeSessionId) return Number.POSITIVE_INFINITY;
  const session = state.sessions[bay.activeSessionId];
  if (!session) return Number.POSITIVE_INFINITY;
  const remainingKwh = Math.max(0, session.requestedKwh - session.deliveredKwh);
  const ceiling = bayCeilingKw(state, bay);
  const power = Math.max(1, ceiling);
  return (remainingKwh / power) * 3_600;
}

// --- aggregate derived state ------------------------------------------------

export function deriveSiteState(state: SimulationState): DerivedSiteState {
  const bays = bayList(state);
  let occupied = 0;
  let idle = 0;
  let faulted = 0;
  let open = 0;
  let allocated = 0;
  for (const bay of bays) {
    if (bay.isOpen) open += 1;
    if (isBusy(bay)) occupied += 1;
    if (bay.state === "idle" && bay.isOpen) idle += 1;
    if (isDown(bay)) faulted += 1;
    allocated += bay.allocatedPowerKw;
  }
  return {
    occupiedBayCount: occupied,
    idleBayCount: idle,
    faultedBayCount: faulted,
    totalOpenBayCount: open,
    totalAllocatedPowerKw: allocated,
    sparePowerKw: state.site.gridPowerKw - allocated,
    projectedWaitSeconds: getProjectedWait(state, state.queue.length),
  };
}

export function queuePressure(state: SimulationState): number {
  const open = bayList(state).filter((b) => b.isOpen).length;
  if (open === 0) return state.queue.length > 0 ? Number.POSITIVE_INFINITY : 0;
  return state.queue.length / open;
}

// --- ROLL window ------------------------------------------------------------

export interface RollWindow {
  seconds: number;
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
  margin: number;
  meanAllocatedPowerKw: number;
  samples: number;
}

export function rollWindow(
  state: SimulationState,
  windowSeconds = ROLL_WINDOW_SECONDS,
): RollWindow {
  const cutoff = state.clock.secondsElapsed - windowSeconds;
  const acc: RollWindow = {
    seconds: 0,
    openBaySeconds: 0,
    occupiedBaySeconds: 0,
    faultSeconds: 0,
    repairSeconds: 0,
    sessionsStarted: 0,
    sessionsCompleted: 0,
    sessionsCompletedWithoutFault: 0,
    queueAbandons: 0,
    startedWaitSecondsSum: 0,
    kwhDelivered: 0,
    margin: 0,
    meanAllocatedPowerKw: 0,
    samples: 0,
  };
  let allocatedSum = 0;
  for (const s of state.tickSamples) {
    if (s.atSecond <= cutoff) continue;
    acc.seconds += state.clock.deltaSeconds;
    acc.openBaySeconds += s.openBaySeconds;
    acc.occupiedBaySeconds += s.occupiedBaySeconds;
    acc.faultSeconds += s.faultSeconds;
    acc.repairSeconds += s.repairSeconds;
    acc.sessionsStarted += s.sessionsStarted;
    acc.sessionsCompleted += s.sessionsCompleted;
    acc.sessionsCompletedWithoutFault += s.sessionsCompletedWithoutFault;
    acc.queueAbandons += s.queueAbandons;
    acc.startedWaitSecondsSum += s.startedWaitSecondsSum;
    acc.kwhDelivered += s.kwhDelivered;
    acc.margin += s.revenue - s.energyCost - s.maintenanceCost - s.opexAccrued;
    allocatedSum += s.allocatedPowerKw;
    acc.samples += 1;
  }
  acc.meanAllocatedPowerKw = acc.samples > 0 ? allocatedSum / acc.samples : 0;
  return acc;
}

export function rollUptimeFraction(w: RollWindow): number {
  if (w.openBaySeconds <= 0) return 1;
  return Math.max(0, 1 - (w.faultSeconds + w.repairSeconds) / w.openBaySeconds);
}

export function rollUtilizationFraction(w: RollWindow): number {
  const available = w.openBaySeconds - w.faultSeconds - w.repairSeconds;
  if (available <= 0) return 0;
  return Math.min(1, w.occupiedBaySeconds / available);
}

export function rollAbandonmentFraction(w: RollWindow): number {
  const denom = w.queueAbandons + w.sessionsStarted;
  if (denom <= 0) return 0;
  return w.queueAbandons / denom;
}

export function rollAvgWaitSeconds(w: RollWindow): number {
  if (w.sessionsStarted <= 0) return 0;
  return w.startedWaitSecondsSum / w.sessionsStarted;
}

export function trustWindowSum(state: SimulationState, windowSeconds: number): number {
  const cutoff = state.clock.secondsElapsed - windowSeconds;
  let sum = 0;
  for (const s of state.tickSamples) {
    if (s.atSecond <= cutoff) continue;
    sum += s.trustDelta;
  }
  return sum;
}

/** Sum of samples older than the current tick, for a trailing comparison. */
export function trustAtSecondsAgo(state: SimulationState, secondsAgo: number): number {
  const cutoff = state.clock.secondsElapsed - secondsAgo;
  let deltaSince = 0;
  for (const s of state.tickSamples) {
    if (s.atSecond <= cutoff) continue;
    deltaSince += s.trustDelta;
  }
  return state.site.metrics.trust - deltaSince;
}
