/**
 * Faults, repairs, and deferred bay transitions — Architecture §4.4, D19.
 *
 * Ordering here is load-bearing: the session is detached and finalized FIRST,
 * then the bay is faulted. Reversing those two makes invariant 4 fire on every
 * fault. `applyPendingBayTransitions` runs after this so a bay freed by an
 * interruption can absorb a latched close or upgrade in the same tick.
 */

import { MAINTENANCE, TRUST } from "../core/calibration.ts";
import { bayList, dataOf, emit, round, type TickContext } from "../core/context.ts";
import type { ChargerBay, FaultCategory } from "../core/types.ts";
import { applyUpgrade, syncOpenBayIds } from "../actions/playerActions.ts";
import { interruptSession } from "./charging.ts";

/** Per-tick hazard that integrates to ≈ (1 − reliabilityBase) over a session. */
export function faultProbabilityPerTick(
  reliabilityBase: number,
  expectedSessionTicks: number,
  maintenanceMultiplier: number,
): number {
  return ((1 - reliabilityBase) / Math.max(1, expectedSessionTicks)) * maintenanceMultiplier;
}

export function resolveFaultsAndRepairs(ctx: TickContext): void {
  const { state } = ctx;
  const now = state.clock.secondsElapsed;
  const maintenance = MAINTENANCE[state.site.policy.maintenanceLevel];

  // 1. Repairs that have run their course.
  for (const bay of bayList(state)) {
    if (bay.state !== "repairing") continue;
    if (bay.repairDueAtSecond !== undefined && now >= bay.repairDueAtSecond) {
      bay.state = "idle";
      bay.faultedAtSecond = undefined;
      bay.faultCategory = undefined;
      bay.repairScheduledAtSecond = undefined;
      bay.repairDueAtSecond = undefined;
      emit(ctx, "info", "charger.repair_completed", `${bay.label} back in service`, {
        entity_type: "charger",
        entity_id: bay.id,
      });
    }
  }

  // 2. Scripted faults — designed story beats, unaffected by maintenance level.
  for (const scripted of state.scenario.scriptedFaults) {
    if (scripted.atSecond < now || scripted.atSecond >= now + ctx.delta) continue;
    const bay = state.chargers[scripted.bayId];
    if (!bay || bay.state === "faulted" || bay.state === "repairing") continue;
    faultBay(ctx, bay, scripted.category, true);
  }

  // 3. Random faults, only on bays actually delivering power.
  for (const bay of bayList(state)) {
    if (bay.state !== "charging" || !bay.activeSessionId) continue;
    const session = state.sessions[bay.activeSessionId];
    if (!session) continue;
    const p = faultProbabilityPerTick(
      bay.spec.reliabilityBase,
      session.expectedSessionTicks,
      maintenance.faultProbabilityMultiplier,
    );
    if (ctx.rng.bool(p)) {
      faultBay(ctx, bay, pickCategory(ctx), false);
    }
  }
}

function pickCategory(ctx: TickContext): FaultCategory {
  return ctx.rng.pick<FaultCategory>([
    ["connector_fault", 0.4],
    ["power_module_fault", 0.25],
    ["cooling_fault", 0.2],
    ["software_fault", 0.15],
  ]);
}

function faultBay(
  ctx: TickContext,
  bay: ChargerBay,
  category: FaultCategory,
  scripted: boolean,
): void {
  const { state } = ctx;
  const sessionId = bay.activeSessionId;
  const hadSession = sessionId !== undefined;

  // D19: detach and finalize the session BEFORE the bay becomes faulted.
  if (sessionId) {
    const session = state.sessions[sessionId];
    if (session) interruptSession(ctx, session);
  } else {
    ctx.trustDeltaRaw += TRUST.faultIdle;
  }

  bay.state = "faulted";
  bay.currentVehicleId = undefined;
  bay.activeSessionId = undefined;
  bay.allocatedPowerKw = 0;
  bay.faultedAtSecond = state.clock.secondsElapsed;
  bay.faultCategory = category;

  emit(ctx, "warn", "charger.fault_detected", `${bay.label} faulted (${category})`, {
    entity_type: "charger",
    entity_id: bay.id,
    data: dataOf({
      fault_category: category,
      scripted,
      interrupted_session: hadSession,
      charger_type: bay.spec.type,
      maintenance_level: state.site.policy.maintenanceLevel,
      max_power_kw: round(bay.spec.maxPowerKw, 0),
    }),
  });
}

/** Latched close/upgrade land the moment the bay reaches `idle` (D19). */
export function applyPendingBayTransitions(ctx: TickContext): void {
  const { state } = ctx;
  let changed = false;

  for (const bay of bayList(state)) {
    if (bay.state !== "idle") continue;

    if (bay.pendingUpgradeType) {
      const newType = bay.pendingUpgradeType;
      applyUpgrade(state, bay.id, newType);
      emit(ctx, "info", "charger.upgraded", `${bay.label} upgrade applied`, {
        entity_type: "charger",
        entity_id: bay.id,
        data: dataOf({ applied: true, charger_type_after: newType, deferred: true }),
      });
    }

    if (bay.closeRequested) {
      bay.isOpen = false;
      bay.closeRequested = false;
      changed = true;
      emit(ctx, "info", "site.bay_group_toggled", `${bay.label} now closed (was busy)`, {
        entity_type: "charger",
        entity_id: bay.id,
        data: dataOf({ open_after: false, deferred: true, bay_ids: bay.id }),
      });
    }
  }

  if (changed) syncOpenBayIds(state);
}
