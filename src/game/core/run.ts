/**
 * Run harness — drives the tick loop headlessly, wires the logger and manifest,
 * and returns everything Phase 1 needs to assert against.
 */

import { queueAction } from "../actions/playerActions.ts";
import type { PolicyActor } from "../experiment/baselinePolicy.ts";
import { createLogger, type SimulationLogger } from "../logging/logger.ts";
import { completeManifest, startManifest, type WallClock } from "../logging/manifest.ts";
import type { RunManifest } from "../logging/schema.ts";
import { checkFinalInvariants, type InvariantViolation } from "../validation/invariants.ts";
import { createInitialState } from "./init.ts";
import { hashState } from "./rng.ts";
import { tick, type TickOptions } from "./tick.ts";
import type { PlayerActionDraft, ScenarioConfig, SimulationState } from "./types.ts";

export interface RunOptions {
  scenario: ScenarioConfig;
  seed: string;
  runId?: string;
  policy?: PolicyActor;
  policyLabel?: RunManifest["policy_label"];
  /** Pre-scripted actions keyed by the tick they should be queued on. */
  scriptedActions?: Map<number, PlayerActionDraft[]>;
  invariants?: TickOptions["invariants"];
  /** Set "info" to drop the per-vehicle debug chatter from a batch run. */
  logLevel?: "debug" | "info";
  wallClock?: WallClock;
  collectLog?: boolean;
}

export interface RunResult {
  manifest: RunManifest;
  finalState: SimulationState;
  initialStateHash: string;
  finalStateHash: string;
  logger: SimulationLogger;
  finalViolations: InvariantViolation[];
  ticks: number;
}

export function runScenario(options: RunOptions): RunResult {
  const {
    scenario,
    seed,
    runId = `run-${scenario.id}-${seed}`,
    policy,
    policyLabel,
    scriptedActions,
    invariants = "throw",
    logLevel = "debug",
    wallClock,
    collectLog = true,
  } = options;

  let state = createInitialState(scenario, seed);
  const initialStateHash = hashState(state);

  const logger = createLogger(
    { run_id: runId, scenario_id: scenario.id, seed },
    logLevel,
  );
  const manifest = startManifest(
    { runId, scenarioId: scenario.id, seed, policyLabel },
    state,
    wallClock,
  );

  if (collectLog) {
    logger.append({
      sim_time_seconds: 0,
      tick_index: 0,
      level: "info",
      event_name: "run.started",
      message: `Run started on ${scenario.name}`,
      entity_type: "run",
      data: { seed, policy_label: policyLabel ?? "played", initial_state_hash: initialStateHash },
    });
    logger.append({
      sim_time_seconds: 0,
      tick_index: 0,
      level: "info",
      event_name: "scenario.loaded",
      message: scenario.name,
      entity_type: "scenario",
      entity_id: scenario.id,
      data: {
        duration_seconds: scenario.durationSeconds,
        tick_seconds: scenario.tickSeconds,
        bays: scenario.bays.length,
        grid_power_kw: scenario.initialGridPowerKw,
      },
    });
  }

  const maxTicks = Math.ceil(scenario.durationSeconds / scenario.tickSeconds);
  let ticks = 0;

  while (state.running && ticks < maxTicks) {
    // Actors decide from the state they can see, exactly as a player does:
    // the action is queued now and applies at the top of the next tick (C8).
    if (policy) {
      for (const action of policy(state)) state = queueAction(state, action);
    }
    const scripted = scriptedActions?.get(state.clock.tick);
    if (scripted) {
      for (const action of scripted) state = queueAction(state, action);
    }

    const result = tick(state, { invariants });
    state = result.state;
    ticks += 1;
    if (collectLog) logger.appendMany(result.events);
  }

  const finalViolations = checkFinalInvariants(state);
  const completed = completeManifest(manifest, state, wallClock);

  return {
    manifest: completed,
    finalState: state,
    initialStateHash,
    finalStateHash: completed.final_state_hash ?? "",
    logger,
    finalViolations,
    ticks,
  };
}
