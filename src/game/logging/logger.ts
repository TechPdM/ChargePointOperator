/**
 * Logger — Architecture §7.4.
 *
 * The sim emits `PendingLogEvent`s; the logger stamps the run envelope
 * (run_id, seed, app_version, environment) onto them. That split is what keeps
 * run identity out of hashed sim state (C11/D26).
 */

import type {
  PendingLogEvent,
  RunLogBundle,
  RunManifest,
  SimulationLogEvent,
} from "./schema.ts";

export const APP_VERSION = "0.1.0-phase1";

export interface LoggerEnvelope {
  run_id: string;
  scenario_id: string;
  seed: string;
  app_version?: string;
  environment?: "dev" | "test" | "prod";
}

export interface SimulationLogger {
  append(event: PendingLogEvent): void;
  appendMany(events: PendingLogEvent[]): void;
  getEvents(): readonly SimulationLogEvent[];
  clear(): void;
  exportNdjson(): string;
  exportJson(manifest: RunManifest): RunLogBundle;
}

export function createLogger(envelope: LoggerEnvelope, minLevel: "debug" | "info" = "debug"): SimulationLogger {
  const events: SimulationLogEvent[] = [];
  const rank = { debug: 0, info: 1, warn: 2, error: 3 } as const;
  const floor = rank[minLevel];

  const stamp = (event: PendingLogEvent): SimulationLogEvent => ({
    log_schema_version: 1,
    service: "chargepoint-operator-mvp",
    environment: envelope.environment ?? "dev",
    app_version: envelope.app_version ?? APP_VERSION,
    run_id: envelope.run_id,
    scenario_id: envelope.scenario_id,
    seed: envelope.seed,
    ...event,
  });

  return {
    append(event) {
      if (rank[event.level] < floor) return;
      events.push(stamp(event));
    },
    appendMany(batch) {
      for (const event of batch) this.append(event);
    },
    getEvents() {
      return events;
    },
    clear() {
      events.length = 0;
    },
    exportNdjson() {
      return events.map((e) => JSON.stringify(e)).join("\n");
    },
    exportJson(manifest) {
      return { manifest, events: [...events] };
    },
  };
}

export function parseNdjson(text: string): SimulationLogEvent[] {
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as SimulationLogEvent);
}
