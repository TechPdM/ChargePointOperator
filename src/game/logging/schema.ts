/**
 * Structured log schema — Architecture §7.
 *
 * Conventions that are binding:
 *  - snake_case keys, `log_schema_version` from day one.
 *  - No wall-clock in events (C11) — ordering is sim_time_seconds + tick_index.
 *  - Sim stores fractions, logs emit `*_pct`; conversion happens HERE and nowhere else (C6).
 *  - One vocabulary per concept: `leave_reason` uses QueueLeaveReason, `trust` is `trust`.
 *  - The action union (§5.6) and this catalogue change together (C6 paired-schema rule),
 *    enforced by invariant 8.
 */

import type { FailureState, PlayerActionType, QueueLeaveReason } from "../core/types.ts";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogEntityType =
  | "run"
  | "scenario"
  | "site"
  | "vehicle"
  | "queue"
  | "charger"
  | "session"
  | "player"
  | "metric";

export type LogEventName =
  | "run.started"
  | "run.completed"
  | "run.failed"
  | "scenario.loaded"
  | "vehicle.arrived"
  | "vehicle.site_accepted"
  | "vehicle.site_rejected"
  | "vehicle.queue_joined"
  | "vehicle.queue_abandoned"
  | "vehicle.departed"
  | "session.started"
  | "session.completed"
  | "session.interrupted"
  | "charger.fault_detected"
  | "charger.repair_scheduled"
  | "charger.repair_started"
  | "charger.repair_completed"
  | "charger.upgraded"
  | "site.price_updated"
  | "site.power_policy_updated"
  | "site.bay_group_toggled"
  | "site.maintenance_level_updated"
  | "site.partial_charge_policy_updated"
  | "metric.snapshot"
  | "failure_state.entered"
  | "failure_state.cleared"
  | "alert.raised"
  | "alert.cleared";

export type LogValue = string | number | boolean | null;

export interface BaseLogEvent {
  log_schema_version: 1;
  sim_time_seconds: number;
  tick_index: number;
  level: LogLevel;
  event_name: LogEventName;
  message: string;
  service: "chargepoint-operator-mvp";
  environment: "dev" | "test" | "prod";
  app_version: string;
  run_id: string;
  scenario_id: string;
  /** String everywhere — the playtest seeds are `pt-1`/`pt-2`/`pt-3` (D26). */
  seed: string;
  entity_type?: LogEntityType;
  entity_id?: string;
  parent_entity_type?: LogEntityType;
  parent_entity_id?: string;
  correlation_id?: string;
  causation_id?: string;
  tags?: string[];
  data?: Record<string, LogValue>;
}

export type SimulationLogEvent = BaseLogEvent;

/**
 * Emitted by the systems during a tick, before run-level fields are stamped on
 * by the logger. Keeping the run envelope out of the sim is what stops run_id
 * and app_version leaking into the hashed state.
 */
export interface PendingLogEvent {
  sim_time_seconds: number;
  tick_index: number;
  level: LogLevel;
  event_name: LogEventName;
  message: string;
  entity_type?: LogEntityType;
  entity_id?: string;
  parent_entity_type?: LogEntityType;
  parent_entity_id?: string;
  data?: Record<string, LogValue>;
}

/**
 * Invariant 8: every action type has exactly one decision-marker event, and
 * vice versa. `charger.repair_scheduled` exists precisely so `schedule_repair`
 * has a partner — `charger.repair_started` is a sim consequence, not a decision.
 */
export const ACTION_EVENT_MAP: Record<PlayerActionType, LogEventName> = {
  set_price: "site.price_updated",
  set_power_policy: "site.power_policy_updated",
  toggle_bay_group: "site.bay_group_toggled",
  schedule_repair: "charger.repair_scheduled",
  set_maintenance_level: "site.maintenance_level_updated",
  upgrade_charger: "charger.upgraded",
  set_partial_charge_target: "site.partial_charge_policy_updated",
};

/** The MVP catalogue cut (§7.4) — everything else waits. */
export const MVP_EVENT_CUT: readonly LogEventName[] = [
  "run.started",
  "run.completed",
  "run.failed",
  "scenario.loaded",
  "vehicle.arrived",
  "vehicle.site_accepted",
  "vehicle.site_rejected",
  "vehicle.queue_joined",
  "vehicle.queue_abandoned",
  "vehicle.departed",
  "session.started",
  "session.completed",
  "session.interrupted",
  "charger.fault_detected",
  "charger.repair_scheduled",
  "charger.repair_started",
  "charger.repair_completed",
  "charger.upgraded",
  "site.price_updated",
  "site.power_policy_updated",
  "site.bay_group_toggled",
  "site.maintenance_level_updated",
  "site.partial_charge_policy_updated",
  "metric.snapshot",
  "failure_state.entered",
  "failure_state.cleared",
  "alert.raised",
  "alert.cleared",
];

export type LeaveReasonLogValue = QueueLeaveReason;
export type FailureStateLogValue = FailureState;

export interface RunManifest {
  run_id: string;
  scenario_id: string;
  seed: string;
  app_version: string;
  /** Wall-clock lives HERE and only here (C11). */
  started_at_utc: string;
  completed_at_utc?: string;
  outcome?: "success" | "fail" | "aborted";
  duration_sim_seconds?: number;
  tick_count?: number;
  initial_state_hash: string;
  final_state_hash: string | undefined;
  policy_label?: "baseline" | "played" | "tester-run";
  failure_states_observed?: FailureState[];
  goals_met?: Record<string, boolean>;
  notes?: string;
}

export interface RunLogBundle {
  manifest: RunManifest;
  events: SimulationLogEvent[];
}
