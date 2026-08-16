/**
 * Replay — Architecture §9.2: re-run the reducer from `RunManifest.seed` plus
 * the logged action stream.
 *
 * This is the strong form of the claim: the decision markers carry enough
 * after-state to rebuild each action, so a run reconstructs from its NDJSON
 * alone. If this test ever fails, either a marker stopped carrying its payload
 * or something non-deterministic crept into `game/` — both are the kind of drift
 * the C6 paired-schema rule exists to catch.
 */

import { runScenario, type RunResult } from "../core/run.ts";
import type {
  ChargerType,
  MaintenanceLevel,
  PlayerActionDraft,
  PowerPolicy,
  ScenarioConfig,
} from "../core/types.ts";
import type { SimulationLogEvent } from "./schema.ts";

export interface ReplayAction {
  /** The tick the action must be QUEUED on to land where it originally did. */
  queueOnTick: number;
  action: PlayerActionDraft;
}

export function extractActionStream(events: readonly SimulationLogEvent[]): ReplayAction[] {
  const out: ReplayAction[] = [];

  for (const e of events) {
    const data = e.data;
    // Decision markers carry an action_id; sim consequences and deferred
    // transitions do not, which is how the two are told apart.
    if (!data || data["action_id"] === undefined) continue;
    const queueOnTick = e.tick_index - 1;
    const action = rebuild(e);
    if (action) out.push({ queueOnTick, action });
  }
  return out;
}

function rebuild(e: SimulationLogEvent): PlayerActionDraft | undefined {
  const d = e.data ?? {};
  switch (e.event_name) {
    case "site.price_updated":
      return {
        type: "set_price",
        pricePerKwh: Number(d["price_per_kwh_after"]),
        connectionFee: Number(d["connection_fee_after"]),
      };
    case "site.power_policy_updated": {
      const raw = d["manual_allocations_kw"];
      return {
        type: "set_power_policy",
        powerPolicy: String(d["power_policy_after"]) as PowerPolicy,
        manualAllocationsKw:
          typeof raw === "string" ? (JSON.parse(raw) as Record<string, number>) : undefined,
      };
    }
    case "site.bay_group_toggled":
      return {
        type: "toggle_bay_group",
        bayIds: String(d["bay_ids"]).split(",").filter(Boolean),
        open: d["open_after"] === true,
      };
    case "charger.repair_scheduled":
      return { type: "schedule_repair", chargerBayId: String(e.entity_id) };
    case "site.maintenance_level_updated":
      return {
        type: "set_maintenance_level",
        level: String(d["maintenance_level_after"]) as MaintenanceLevel,
      };
    case "charger.upgraded":
      return {
        type: "upgrade_charger",
        chargerBayId: String(e.entity_id),
        newType: String(d["charger_type_after"]) as ChargerType,
      };
    case "site.partial_charge_policy_updated": {
      const after = d["partial_charge_target_pct_after"];
      return {
        type: "set_partial_charge_target",
        targetSoc: after === null || after === undefined ? null : Number(after) / 100,
      };
    }
    default:
      return undefined;
  }
}

export function replayFromLog(
  scenario: ScenarioConfig,
  seed: string,
  events: readonly SimulationLogEvent[],
): RunResult {
  const stream = extractActionStream(events);
  const scriptedActions = new Map<number, PlayerActionDraft[]>();
  for (const { queueOnTick, action } of stream) {
    const list = scriptedActions.get(queueOnTick) ?? [];
    list.push(action);
    scriptedActions.set(queueOnTick, list);
  }
  return runScenario({
    scenario,
    seed,
    scriptedActions,
    runId: `replay-${seed}`,
    collectLog: false,
  });
}
