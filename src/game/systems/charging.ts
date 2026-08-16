/**
 * Session lifecycle and energy delivery.
 *
 * `effectivePowerKw = min(bayAllocatedKw, vehicle.maxChargeRateKw) × taper(soc)`
 * (D14/D15) — the taper is applied during power allocation, so by the time a
 * session advances, `bay.allocatedPowerKw` already is the effective power.
 */

import { archetypeName } from "../core/labels.ts";
import { taper, TRUST } from "../core/calibration.ts";
import { dataOf, emit, round, type TickContext } from "../core/context.ts";
import type { ChargerBay, ChargingSession, SimulationState, VehicleAgent } from "../core/types.ts";
import { departVehicle } from "./vehicles.ts";

/** Site policy may cap a driver's own target, never raise it (D14). */
export function effectiveTargetSoc(state: SimulationState, vehicle: VehicleAgent): number {
  const policyTarget = state.site.policy.partialChargeTargetSoc ?? 1;
  return Math.min(vehicle.demand.targetSoc, policyTarget);
}

export function startSession(ctx: TickContext, vehicle: VehicleAgent, bay: ChargerBay): void {
  const { state } = ctx;
  const target = effectiveTargetSoc(state, vehicle);
  const requestedKwh = Math.max(0, (target - vehicle.currentSoc) * vehicle.batteryCapacityKwh);
  // Optimistic estimate: what this bay/vehicle pair could do with the whole
  // ceiling to itself. Used for the fault divisor and queue_relief ordering.
  const nominalPowerKw = Math.max(
    1,
    Math.min(bay.spec.maxPowerKw, vehicle.maxChargeRateKw) * taper(vehicle.currentSoc),
  );
  const estimatedDurationSeconds = (requestedKwh / nominalPowerKw) * 3_600;

  const id = `s-${state.nextSessionSeq}`;
  state.nextSessionSeq += 1;

  const waitSeconds =
    vehicle.queuedAtSecond === undefined ? 0 : state.clock.secondsElapsed - vehicle.queuedAtSecond;

  const session: ChargingSession = {
    id,
    siteId: state.site.id,
    vehicleId: vehicle.id,
    chargerBayId: bay.id,
    startedAtSecond: state.clock.secondsElapsed,
    updatedAtSecond: state.clock.secondsElapsed,
    requestedKwh,
    deliveredKwh: 0,
    targetSoc: target,
    effectivePowerKw: 0,
    pricePerKwh: state.site.policy.pricePerKwh,
    connectionFee: state.site.policy.connectionFee,
    estimatedDurationSeconds,
    completed: false,
    interruptedByFault: false,
    expectedSessionTicks: Math.max(1, Math.round(estimatedDurationSeconds / 60)),
    partialChargeCapped: target < vehicle.demand.targetSoc,
  };

  state.sessions[id] = session;
  state.activeSessionIds.push(id);

  bay.state = "allocated";
  bay.currentVehicleId = vehicle.id;
  bay.activeSessionId = id;
  bay.lifetimeSessions += 1;

  vehicle.state = "charging";
  vehicle.chargingStartedAtSecond = state.clock.secondsElapsed;

  // Connection fee is earned at the plug-in, not at completion.
  state.site.economics.revenueToday += session.connectionFee;
  ctx.sample.revenue += session.connectionFee;

  state.site.metrics.funnel.sessionsStarted += 1;
  state.site.metrics.cumWaitSecondsSum += waitSeconds;
  state.site.metrics.cumStartedSessions += 1;
  ctx.sample.sessionsStarted += 1;
  ctx.sample.startedWaitSecondsSum += waitSeconds;

  emit(ctx, "info", "session.started", `${archetypeName(vehicle.archetype)} charging on ${bay.label}`, {
    entity_type: "session",
    entity_id: id,
    parent_entity_type: "charger",
    parent_entity_id: bay.id,
    data: dataOf({
      vehicle_id: vehicle.id,
      archetype: vehicle.archetype,
      requested_kwh: round(requestedKwh, 2),
      target_soc_pct: round(target * 100, 1),
      start_soc_pct: round(vehicle.currentSoc * 100, 1),
      wait_seconds: round(waitSeconds, 0),
      price_per_kwh: round(session.pricePerKwh, 2),
      connection_fee_amount: round(session.connectionFee, 2),
      estimated_duration_seconds: round(estimatedDurationSeconds, 0),
      partial_charge_capped: session.partialChargeCapped,
    }),
  });
}

export function advanceActiveSessions(ctx: TickContext): void {
  const { state } = ctx;
  const scenario = state.scenario;

  for (const sessionId of [...state.activeSessionIds]) {
    const session = state.sessions[sessionId];
    if (!session) continue;
    const bay = state.chargers[session.chargerBayId];
    const vehicle = state.vehicles[session.vehicleId];
    if (!bay || !vehicle) continue;

    const powerKw = bay.allocatedPowerKw;
    session.effectivePowerKw = powerKw;
    session.updatedAtSecond = state.clock.secondsElapsed;

    const remainingKwh = Math.max(0, session.requestedKwh - session.deliveredKwh);
    const deliverable = (powerKw * ctx.delta) / 3_600;
    const delivered = Math.min(deliverable, remainingKwh);

    if (delivered > 0) {
      session.deliveredKwh += delivered;
      vehicle.currentSoc = Math.min(1, vehicle.currentSoc + delivered / vehicle.batteryCapacityKwh);
      bay.lifetimeKwh += delivered;

      const revenue = delivered * session.pricePerKwh;
      const energyCost = delivered * scenario.energyCostPerKwh;
      state.site.economics.revenueToday += revenue;
      state.site.economics.energyCostToday += energyCost;
      state.site.metrics.kwhDelivered += delivered;
      ctx.sample.revenue += revenue;
      ctx.sample.energyCost += energyCost;
      ctx.sample.kwhDelivered += delivered;
    }

    if (session.deliveredKwh >= session.requestedKwh - 1e-9) {
      completeSession(ctx, session, "completed");
    }
  }
}

export function completeSession(
  ctx: TickContext,
  session: ChargingSession,
  how: "completed" | "scenario_end",
): void {
  const { state } = ctx;
  const bay = state.chargers[session.chargerBayId];
  const vehicle = state.vehicles[session.vehicleId];

  session.completed = true;
  session.endedAtSecond = state.clock.secondsElapsed;
  session.actualDurationSeconds = session.endedAtSecond - session.startedAtSecond;
  detachSession(state, session.id);

  if (bay) {
    bay.state = "idle";
    bay.currentVehicleId = undefined;
    bay.activeSessionId = undefined;
    bay.allocatedPowerKw = 0;
  }

  state.site.metrics.sessionsCompleted += 1;
  state.site.metrics.funnel.completed += 1;
  ctx.sample.sessionsCompleted += 1;
  ctx.sample.sessionsCompletedWithoutFault += 1;

  if (vehicle) {
    const waitSeconds =
      vehicle.queuedAtSecond === undefined || vehicle.chargingStartedAtSecond === undefined
        ? 0
        : vehicle.chargingStartedAtSecond - vehicle.queuedAtSecond;
    // D30: no flat reward for completing — that is the job. A plug free on
    // arrival earns goodwill; a long queue spends it, even when the driver
    // stayed to the end.
    ctx.trustDeltaRaw += TRUST.completion;
    ctx.trustDeltaRaw +=
      waitSeconds < TRUST.fastCompletionWaitSeconds
        ? TRUST.fastCompletionBonus
        : TRUST.slowCompletionPenalty;
    if (session.partialChargeCapped) {
      ctx.trustDeltaRaw += TRUST.partialChargeCapped;
    }
  }

  emit(
    ctx,
    "info",
    "session.completed",
    how === "scenario_end" ? "Session closed out at end of day" : "Session completed",
    {
      entity_type: "session",
      entity_id: session.id,
      parent_entity_type: "charger",
      parent_entity_id: session.chargerBayId,
      data: dataOf({
        vehicle_id: session.vehicleId,
        delivered_kwh: round(session.deliveredKwh, 2),
        requested_kwh: round(session.requestedKwh, 2),
        actual_duration_seconds: round(session.actualDurationSeconds ?? 0, 0),
        revenue_amount: round(
          session.deliveredKwh * session.pricePerKwh + session.connectionFee,
          2,
        ),
        closed_at_run_end: how === "scenario_end",
        partial_charge_capped: session.partialChargeCapped,
      }),
    },
  );

  if (vehicle) departVehicle(ctx, vehicle, "completed");
}

/**
 * D19: the session is detached and finalized BEFORE the bay is faulted.
 * Reversing those two lines makes invariant 4 fire on every single fault.
 */
export function interruptSession(ctx: TickContext, session: ChargingSession): void {
  const { state } = ctx;
  const vehicle = state.vehicles[session.vehicleId];

  session.completed = false;
  session.interruptedByFault = true;
  session.endedAtSecond = state.clock.secondsElapsed;
  session.actualDurationSeconds = session.endedAtSecond - session.startedAtSecond;
  detachSession(state, session.id);

  state.site.metrics.funnel.interruptedByFault += 1;
  ctx.sample.sessionsCompleted += 1; // ended, but not without fault
  ctx.trustDeltaRaw += TRUST.faultMidSession;

  emit(ctx, "warn", "session.interrupted", "Session cut short by a fault", {
    entity_type: "session",
    entity_id: session.id,
    parent_entity_type: "charger",
    parent_entity_id: session.chargerBayId,
    data: dataOf({
      vehicle_id: session.vehicleId,
      delivered_kwh: round(session.deliveredKwh, 2),
      requested_kwh: round(session.requestedKwh, 2),
      revenue_amount: round(session.deliveredKwh * session.pricePerKwh + session.connectionFee, 2),
    }),
  });

  if (vehicle) departVehicle(ctx, vehicle, "service_interrupted");
}

function detachSession(state: SimulationState, sessionId: string): void {
  state.activeSessionIds = state.activeSessionIds.filter((id) => id !== sessionId);
  state.completedSessionIds.push(sessionId);
}
