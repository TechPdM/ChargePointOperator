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
  ChargerType,
  DemandWave,
  DerivedSiteState,
  SimulationState,
  UpgradeCost,
  VehicleAgent,
} from "./types.ts";

// --- upgrades ---------------------------------------------------------------

/**
 * The upgrade path out of a bay's current type, if the scenario sells one.
 *
 * Matched on `from` alone: a site can offer more than one path (the destination
 * site sells slow_ac→rapid_dc and rapid_dc→ultrarapid), and every bay has at
 * most one step available from where it currently is.
 */
export function upgradePathFor(state: SimulationState, bay: ChargerBay): UpgradeCost | undefined {
  return state.scenario.upgradeCosts.find((c) => c.from === bay.spec.type);
}

/** The specific path a player asked for, which may not be the one on offer. */
export function upgradePathBetween(
  state: SimulationState,
  from: ChargerType,
  to: ChargerType,
): UpgradeCost | undefined {
  return state.scenario.upgradeCosts.find((c) => c.from === from && c.to === to);
}

/**
 * **The affordability rule, and the only copy of it.**
 *
 * It used to live solely in `BayAvailabilityPanel`, which meant the reducer
 * would happily take a site to −£25,000 and the only thing stopping a player
 * was a greyed-out button. Every capex test in the suite passed on a purchase
 * the UI would have refused. Both sides now read this.
 *
 * Cash, not margin: capex touches cash only (D12), and the question is whether
 * the money is in the bank on the tick the action reduces — not when it was
 * queued.
 */
export function canAffordUpgrade(state: SimulationState, cost: UpgradeCost): boolean {
  return state.site.economics.cash >= cost.capexCost;
}

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

/**
 * `null` means the window holds no evidence — no bay was open in it — not that
 * uptime was perfect. Returning 1 for that case made a site with every bay
 * closed report 100% uptime in green.
 *
 * Callers that need a number must coalesce **explicitly**, so the choice of
 * what no-evidence means is made where it is understood: the detectors read it
 * as 100% (no open bay cannot be an unreliable one), the dashboard renders it
 * as "—".
 */
export function rollUptimeFraction(w: RollWindow): number | null {
  if (w.openBaySeconds <= 0) return null;
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

/**
 * `null` when no session started inside the window — nobody's wait was measured,
 * which is not the same as nobody waiting.
 *
 * The old `0` was the worst possible lie this dashboard could tell: a site so
 * jammed that nothing started for 15 minutes showed a green "0.0 min" average
 * wait. Measured on a flooded run, that happened on 9% of all ticks that had a
 * queue, with up to nine cars in it.
 */
export function rollAvgWaitSeconds(w: RollWindow): number | null {
  if (w.sessionsStarted <= 0) return null;
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
