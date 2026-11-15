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
import { drawFor, wearLimitFor, type Rng } from "../core/rng.ts";
import type { ChargerBay, FaultCategory } from "../core/types.ts";
import { applyUpgrade, syncOpenBayIds } from "../actions/playerActions.ts";
import { interruptSession } from "./charging.ts";
import { beginRepair } from "./repairs.ts";

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

  // 2. D53: the maintenance contractor turns up once a fault has stood for the
  // contract's response time. No contract (reactive) means nobody comes.
  const response = maintenance.contractResponseSeconds;
  if (response !== undefined) {
    for (const bay of bayList(state)) {
      // D64: a closed bay is off the contractor's list until it reopens.
      if (bay.state !== "faulted" || bay.faultedAtSecond === undefined || !bay.isOpen) continue;
      if (now - bay.faultedAtSecond >= response) beginRepair(ctx, bay, "contract");
    }
  }

  // 3. Scripted faults — designed story beats, unaffected by maintenance level.
  // D54: a closed bay cannot fault, the scripted beat included. Closing the bay
  // the story was going to break is the player's call, and it costs capacity.
  for (const scripted of state.scenario.scriptedFaults) {
    if (scripted.atSecond < now || scripted.atSecond >= now + ctx.delta) continue;
    const bay = state.chargers[scripted.bayId];
    if (!bay || !bay.isOpen || bay.state === "faulted" || bay.state === "repairing") continue;
    faultBay(ctx, bay, scripted.category, true);
  }

  // 4. Random faults, only on bays actually delivering power.
  for (const bay of bayList(state)) {
    if (bay.state !== "charging" || !bay.activeSessionId) continue;
    const session = state.sessions[bay.activeSessionId];
    if (!session) continue;
    const p = faultProbabilityPerTick(
      bay.spec.reliabilityBase,
      session.expectedSessionTicks,
      maintenance.faultProbabilityMultiplier,
    );
    // D65: wear against the bay's budget, not a coin toss each minute. The
    // hazard is the same, so the average fault rate is unchanged; what changes
    // is that a fault moves a few minutes when play changes, not in or out.
    bay.wear += p;
    if (bay.wear >= bay.wearLimit) {
      const kind = drawFor(state.rngSeed, "fault-kind", bay.id, bay.wearFaults);
      bay.wearFaults += 1;
      bay.wear = 0;
      bay.wearLimit = wearLimitFor(state.rngSeed, bay.id, bay.wearFaults);
      faultBay(ctx, bay, pickCategory(kind), false);
    }
  }
}

function pickCategory(rng: Rng): FaultCategory {
  return rng.pick<FaultCategory>([
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
