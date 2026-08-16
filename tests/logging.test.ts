/**
 * Logging, manifest and replay — Architecture §7, §9.2.
 *
 * The headline claim is the last describe block: a run reconstructs from its
 * own NDJSON plus a seed, and lands on the same final state hash.
 */

import { describe, expect, it } from "vitest";
import { runScenario } from "../src/game/core/run.ts";
import { baselinePolicy } from "../src/game/experiment/baselinePolicy.ts";
import { roadsideHub } from "../src/game/scenarios/roadsideHub.ts";
import { parseNdjson } from "../src/game/logging/logger.ts";
import { extractActionStream, replayFromLog } from "../src/game/logging/replay.ts";
import { summariseRun } from "../src/game/experiment/compareRuns.ts";
import type { PlayerActionDraft } from "../src/game/core/types.ts";

const FIXED_CLOCK = () => "2026-08-16T12:00:00.000Z";

function baselineRun(seed = "pt-1") {
  return runScenario({
    scenario: roadsideHub,
    seed,
    policy: baselinePolicy,
    policyLabel: "baseline",
    wallClock: FIXED_CLOCK,
  });
}

describe("event stream", () => {
  it("carries no wall-clock timestamps (C11)", () => {
    const events = baselineRun().logger.getEvents();
    expect(events.length).toBeGreaterThan(100);
    for (const e of events) {
      expect(e).not.toHaveProperty("timestamp_utc");
      expect(e).not.toHaveProperty("real_time_iso");
      expect(typeof e.sim_time_seconds).toBe("number");
      expect(typeof e.tick_index).toBe("number");
    }
  });

  it("stamps the run envelope on every event, with a string seed (D26)", () => {
    const events = baselineRun("pt-2").logger.getEvents();
    for (const e of events) {
      expect(e.log_schema_version).toBe(1);
      expect(e.seed).toBe("pt-2");
      expect(typeof e.seed).toBe("string");
      expect(e.service).toBe("chargepoint-operator-mvp");
      expect(e.scenario_id).toBe(roadsideHub.id);
    }
  });

  it("is ordered by sim time", () => {
    const events = baselineRun().logger.getEvents();
    let last = -1;
    for (const e of events) {
      expect(e.sim_time_seconds).toBeGreaterThanOrEqual(last);
      last = e.sim_time_seconds;
    }
  });

  it("uses one vocabulary for departures — leave_reason, never abandonment_reason (C6)", () => {
    const events = baselineRun().logger.getEvents();
    const departures = events.filter((e) => e.event_name === "vehicle.departed");
    expect(departures.length).toBeGreaterThan(50);
    const legal = new Set([
      "completed",
      "reject_site",
      "site_full",
      "queue_abandon",
      "service_interrupted",
      "scenario_end",
    ]);
    for (const e of departures) {
      expect(e.data).toBeDefined();
      expect(e.data).not.toHaveProperty("abandonment_reason");
      expect(legal.has(String(e.data?.["leave_reason"]))).toBe(true);
    }
  });

  it("emits fractions as *_pct only at the log boundary (C6)", () => {
    const events = baselineRun().logger.getEvents();
    const snapshots = events.filter((e) => e.event_name === "metric.snapshot");
    expect(snapshots.length).toBe(288); // one per 300 sim-s over a 24 h day (D9)
    for (const s of snapshots) {
      const uptime = Number(s.data?.["uptime_pct"]);
      expect(uptime).toBeGreaterThanOrEqual(0);
      expect(uptime).toBeLessThanOrEqual(100);
      expect(s.data).toHaveProperty("session_success_rate_pct");
      expect(s.data).toHaveProperty("charge_start_success_rate_pct");
      expect(s.data).toHaveProperty("downtime_fault_seconds");
      expect(s.data).toHaveProperty("downtime_repair_seconds");
      expect(s.data).toHaveProperty("downtime_closed_seconds");
    }
  });

  it("uses `trust`, not `trust_score` (C6)", () => {
    const events = baselineRun().logger.getEvents();
    for (const e of events) {
      if (e.data) expect(e.data).not.toHaveProperty("trust_score");
    }
    const snapshot = events.find((e) => e.event_name === "metric.snapshot");
    expect(snapshot?.data).toHaveProperty("trust");
  });
});

describe("NDJSON export", () => {
  it("round-trips through parse", () => {
    const result = baselineRun();
    const ndjson = result.logger.exportNdjson();
    const parsed = parseNdjson(ndjson);
    expect(parsed.length).toBe(result.logger.getEvents().length);
    expect(parsed[0]?.event_name).toBe("run.started");
    expect(ndjson.split("\n").length).toBe(parsed.length);
  });
});

describe("run manifest", () => {
  it("is the only place wall-clock time lives (C11)", () => {
    const { manifest } = baselineRun();
    expect(manifest.started_at_utc).toBe("2026-08-16T12:00:00.000Z");
    expect(manifest.completed_at_utc).toBe("2026-08-16T12:00:00.000Z");
    expect(manifest.seed).toBe("pt-1");
    expect(manifest.policy_label).toBe("baseline");
    expect(manifest.tick_count).toBe(1_440);
    expect(manifest.duration_sim_seconds).toBe(86_400);
    expect(manifest.initial_state_hash).toMatch(/^[0-9a-f]{8}$/);
    expect(manifest.final_state_hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it("records goal outcomes and observed failure states (D24)", () => {
    const { manifest } = baselineRun();
    expect(Object.keys(manifest.goals_met ?? {}).sort()).toEqual([
      "maxAvgWaitSeconds",
      "minOperatingMargin",
      "minSessionsCompleted",
      "minTrust",
    ]);
    expect(Array.isArray(manifest.failure_states_observed)).toBe(true);
  });
});

describe("replay from the log alone (§9.2)", () => {
  it("reproduces the final state hash of a played run", () => {
    const scriptedActions = new Map<number, PlayerActionDraft[]>([
      [60, [{ type: "set_price", pricePerKwh: 0.92, connectionFee: 1.5 }]],
      [200, [{ type: "set_maintenance_level", level: "preventive" }]],
      [400, [{ type: "set_power_policy", powerPolicy: "queue_relief" }]],
      [600, [{ type: "set_partial_charge_target", targetSoc: 0.8 }]],
      [
        800,
        [
          { type: "toggle_bay_group", bayIds: ["bay-1", "bay-2"], open: false },
          { type: "upgrade_charger", chargerBayId: "bay-3", newType: "ultrarapid_dc" },
        ],
      ],
      [1_000, [{ type: "toggle_bay_group", bayIds: ["bay-1"], open: true }]],
      [1_100, [{ type: "set_partial_charge_target", targetSoc: null }]],
      [
        1_200,
        [
          {
            type: "set_power_policy",
            powerPolicy: "manual",
            manualAllocationsKw: { "bay-4": 40, "bay-5": 120 },
          },
        ],
      ],
    ]);

    const original = runScenario({
      scenario: roadsideHub,
      seed: "pt-3",
      policy: baselinePolicy,
      scriptedActions,
      policyLabel: "played",
    });

    const events = parseNdjson(original.logger.exportNdjson());
    const replayed = replayFromLog(roadsideHub, "pt-3", events);

    expect(replayed.finalStateHash).toBe(original.finalStateHash);
    expect(summariseRun(replayed).sessionsCompleted).toBe(
      summariseRun(original).sessionsCompleted,
    );
  });

  it("recovers every player action, and only player actions", () => {
    const scriptedActions = new Map<number, PlayerActionDraft[]>([
      [100, [{ type: "set_price", pricePerKwh: 0.85 }]],
      [200, [{ type: "toggle_bay_group", bayIds: ["bay-6"], open: false }]],
    ]);
    const run = runScenario({
      scenario: roadsideHub,
      seed: "s1",
      policy: baselinePolicy,
      scriptedActions,
    });
    const stream = extractActionStream(run.logger.getEvents());

    // The two scripted actions, plus one schedule_repair per fault the
    // baseline reacted to. Deferred bay transitions carry no action_id, so
    // they must not appear here.
    const types = stream.map((s) => s.action.type);
    expect(types).toContain("set_price");
    expect(types).toContain("toggle_bay_group");
    expect(types.filter((t) => t === "toggle_bay_group").length).toBe(1);
    expect(stream.find((s) => s.action.type === "set_price")?.queueOnTick).toBe(100);
  });
});
