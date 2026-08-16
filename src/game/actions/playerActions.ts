/**
 * Player actions — construction, validation and application.
 *
 * Matched pair with `logging/schema.ts` (C6). Every action here emits exactly
 * one decision-marker event carrying full before/after values, which is what
 * makes "what did you change?" answerable from the log alone.
 */

import { CHARGER_SPECS, MAINTENANCE, PRICE_MAX, PRICE_MIN } from "../core/calibration.ts";
import { dataOf, emit, mustBay, round, type TickContext } from "../core/context.ts";
import type {
  ChargerType,
  Id,
  MaintenanceLevel,
  PlayerAction,
  PlayerActionDraft,
  PowerPolicy,
  SimulationState,
} from "../core/types.ts";

/** Stamp an action with tick/second from the state it is being queued against. */
export function queueAction(
  state: SimulationState,
  action: PlayerActionDraft,
  id?: Id,
): SimulationState {
  const stamped = {
    ...action,
    id: id ?? `a-${state.clock.tick}-${state.pendingActions.length}`,
    tick: state.clock.tick,
    atSecond: state.clock.secondsElapsed,
  } as PlayerAction;
  return { ...state, pendingActions: [...state.pendingActions, stamped] };
}

/**
 * Drained at the top of every tick — actions apply the tick after they are
 * issued, with no decision window gating input (C8).
 */
export function applyPlayerActions(ctx: TickContext): void {
  const pending = ctx.state.pendingActions;
  ctx.state.pendingActions = [];
  for (const action of pending) applyOne(ctx, action);
  syncOpenBayIds(ctx.state);
}

function applyOne(ctx: TickContext, action: PlayerAction): void {
  const { state } = ctx;
  const policy = state.site.policy;

  switch (action.type) {
    case "set_price": {
      const beforePrice = policy.pricePerKwh;
      const beforeFee = policy.connectionFee;
      policy.pricePerKwh = clamp(action.pricePerKwh, PRICE_MIN, PRICE_MAX);
      if (action.connectionFee !== undefined) {
        policy.connectionFee = Math.max(0, action.connectionFee);
      }
      emit(ctx, "info", "site.price_updated", `Price set to £${policy.pricePerKwh.toFixed(2)}/kWh`, {
        entity_type: "site",
        entity_id: state.site.id,
        data: dataOf({
          action_id: action.id,
          price_per_kwh_before: round(beforePrice, 2),
          price_per_kwh_after: round(policy.pricePerKwh, 2),
          connection_fee_before: round(beforeFee, 2),
          connection_fee_after: round(policy.connectionFee, 2),
        }),
      });
      break;
    }

    case "set_power_policy": {
      const before: PowerPolicy = policy.powerPolicy;
      policy.powerPolicy = action.powerPolicy;
      if (action.powerPolicy === "manual") {
        policy.manualAllocationsKw = { ...(action.manualAllocationsKw ?? {}) };
      } else {
        policy.manualAllocationsKw = undefined;
      }
      emit(ctx, "info", "site.power_policy_updated", `Power policy set to ${action.powerPolicy}`, {
        entity_type: "site",
        entity_id: state.site.id,
        data: dataOf({
          action_id: action.id,
          power_policy_before: before,
          power_policy_after: action.powerPolicy,
          // Serialised so a run is replayable from the log alone (§9.2).
          manual_allocations_kw: action.manualAllocationsKw
            ? JSON.stringify(action.manualAllocationsKw)
            : null,
        }),
      });
      break;
    }

    case "toggle_bay_group": {
      const applied: string[] = [];
      const latched: string[] = [];
      for (const bayId of action.bayIds) {
        const bay = state.chargers[bayId];
        if (!bay) continue;
        if (action.open) {
          // Opening takes effect immediately, and cancels a pending close (D19).
          bay.isOpen = true;
          bay.closeRequested = false;
          applied.push(bayId);
        } else if (bay.state === "idle") {
          bay.isOpen = false;
          bay.closeRequested = false;
          applied.push(bayId);
        } else {
          // Busy, faulted or repairing: latch. The reducer never terminates a
          // session to satisfy a close request.
          bay.closeRequested = true;
          latched.push(bayId);
        }
      }
      emit(
        ctx,
        "info",
        "site.bay_group_toggled",
        `${action.open ? "Opened" : "Closed"} ${action.bayIds.length} bay(s)`,
        {
          entity_type: "site",
          entity_id: state.site.id,
          data: dataOf({
            action_id: action.id,
            open_after: action.open,
            bay_ids: action.bayIds.join(","),
            applied_immediately: applied.join(",") || null,
            latched_pending: latched.join(",") || null,
          }),
        },
      );
      break;
    }

    case "schedule_repair": {
      const bay = state.chargers[action.chargerBayId];
      if (!bay || bay.state !== "faulted") {
        // No-op by design (Arch §4.4). The UI should disable the control rather
        // than rely on this, so it is a warning, not silence.
        emit(ctx, "warn", "charger.repair_scheduled", `Repair no-op on ${action.chargerBayId}`, {
          entity_type: "charger",
          entity_id: action.chargerBayId,
          data: dataOf({
            action_id: action.id,
            applied: false,
            bay_state: bay?.state ?? "missing",
          }),
        });
        break;
      }
      const profile = MAINTENANCE[policy.maintenanceLevel];
      const durationSeconds = Math.round(bay.spec.repairSecondsMean * profile.repairTimeMultiplier);
      bay.state = "repairing";
      bay.repairScheduledAtSecond = state.clock.secondsElapsed;
      bay.repairDueAtSecond = state.clock.secondsElapsed + durationSeconds;
      // Cost is debited immediately, on the tick the player acted.
      state.site.economics.maintenanceCostToday += profile.costPerRepair;
      ctx.sample.maintenanceCost += profile.costPerRepair;

      emit(ctx, "info", "charger.repair_scheduled", `Repair scheduled for ${bay.label}`, {
        entity_type: "charger",
        entity_id: bay.id,
        data: dataOf({
          action_id: action.id,
          applied: true,
          repair_cost_amount: profile.costPerRepair,
          repair_due_at_second: bay.repairDueAtSecond,
          maintenance_level: policy.maintenanceLevel,
        }),
      });
      emit(ctx, "info", "charger.repair_started", `${bay.label} under repair`, {
        entity_type: "charger",
        entity_id: bay.id,
        data: dataOf({
          repair_seconds: durationSeconds,
          fault_category: bay.faultCategory ?? null,
        }),
      });
      break;
    }

    case "set_maintenance_level": {
      const before: MaintenanceLevel = policy.maintenanceLevel;
      policy.maintenanceLevel = action.level;
      emit(
        ctx,
        "info",
        "site.maintenance_level_updated",
        `Maintenance level set to ${action.level}`,
        {
          entity_type: "site",
          entity_id: state.site.id,
          data: dataOf({
            action_id: action.id,
            maintenance_level_before: before,
            maintenance_level_after: action.level,
            standing_cost_per_sim_day: MAINTENANCE[action.level].standingCostPerSimDay,
          }),
        },
      );
      break;
    }

    case "upgrade_charger": {
      const bay = state.chargers[action.chargerBayId];
      if (!bay) break;
      const cost = state.scenario.upgradeCosts.find(
        (c) => c.from === bay.spec.type && c.to === action.newType,
      );
      if (!cost) {
        emit(ctx, "warn", "charger.upgraded", `No upgrade path ${bay.spec.type}→${action.newType}`, {
          entity_type: "charger",
          entity_id: bay.id,
          data: dataOf({ action_id: action.id, applied: false }),
        });
        break;
      }
      // Capex hits cash on THIS tick; the spec swap lands when the bay idles (D19).
      state.site.economics.capexSpentToday += cost.capexCost;
      ctx.sample.capex += cost.capexCost;
      const immediate = bay.state === "idle";
      if (immediate) {
        applyUpgrade(state, bay.id, action.newType);
      } else {
        bay.pendingUpgradeType = action.newType;
      }
      emit(ctx, "info", "charger.upgraded", `${bay.label} upgrade to ${action.newType}`, {
        entity_type: "charger",
        entity_id: bay.id,
        data: dataOf({
          action_id: action.id,
          applied: true,
          charger_type_before: cost.from,
          charger_type_after: action.newType,
          capex_amount: cost.capexCost,
          takes_effect: immediate ? "immediate" : "when_bay_idles",
        }),
      });
      break;
    }

    case "set_partial_charge_target": {
      const before = policy.partialChargeTargetSoc;
      // null travels over the wire; undefined is the one canonical off-state.
      policy.partialChargeTargetSoc =
        action.targetSoc === null ? undefined : clamp(action.targetSoc, 0.5, 1);
      emit(
        ctx,
        "info",
        "site.partial_charge_policy_updated",
        policy.partialChargeTargetSoc === undefined
          ? "Charging limit off"
          : `Charging limit set to ${Math.round(policy.partialChargeTargetSoc * 100)}%`,
        {
          entity_type: "site",
          entity_id: state.site.id,
          data: dataOf({
            action_id: action.id,
            partial_charge_target_pct_before: before === undefined ? null : round(before * 100, 1),
            partial_charge_target_pct_after:
              policy.partialChargeTargetSoc === undefined
                ? null
                : round(policy.partialChargeTargetSoc * 100, 1),
          }),
        },
      );
      break;
    }
  }
}

/**
 * Swap a bay's live spec. The scenario roster is deliberately left alone — it
 * records what the site was built with, not what it is now.
 */
export function applyUpgrade(state: SimulationState, bayId: Id, newType: ChargerType): void {
  const bay = mustBay(state, bayId);
  bay.spec = { ...CHARGER_SPECS[newType] };
  bay.pendingUpgradeType = undefined;
}

export function syncOpenBayIds(state: SimulationState): void {
  state.site.openBayIds = state.scenario.bays
    .map((b) => b.id)
    .filter((id) => state.chargers[id]?.isOpen === true);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
