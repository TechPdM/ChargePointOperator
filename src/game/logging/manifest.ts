/**
 * Run manifest — Architecture §7.2.
 *
 * The only place in the project where wall-clock time is allowed (C11). The
 * clock is injected rather than read, so tests and replays stay deterministic
 * and `game/` keeps its ban on `new Date()`.
 */

import { hashState } from "../core/rng.ts";
import type { FailureState, SimulationState } from "../core/types.ts";
import { evaluateGoals } from "../systems/scoring.ts";
import { APP_VERSION } from "./logger.ts";
import type { RunManifest } from "./schema.ts";

export type WallClock = () => string;

export const systemWallClock: WallClock = () => new Date().toISOString();

export interface ManifestSeed {
  runId: string;
  scenarioId: string;
  seed: string;
  policyLabel?: RunManifest["policy_label"];
  notes?: string;
}

export function startManifest(
  info: ManifestSeed,
  initialState: SimulationState,
  now: WallClock = systemWallClock,
): RunManifest {
  return {
    run_id: info.runId,
    scenario_id: info.scenarioId,
    seed: info.seed,
    app_version: APP_VERSION,
    started_at_utc: now(),
    initial_state_hash: hashState(initialState),
    final_state_hash: undefined,
    policy_label: info.policyLabel,
    notes: info.notes,
  };
}

export function completeManifest(
  manifest: RunManifest,
  finalState: SimulationState,
  now: WallClock = systemWallClock,
): RunManifest {
  const outcome = evaluateGoals(finalState);
  return {
    ...manifest,
    completed_at_utc: now(),
    outcome: finalState.result ?? "aborted",
    duration_sim_seconds: finalState.clock.secondsElapsed,
    tick_count: finalState.clock.tick,
    final_state_hash: hashState(finalState),
    failure_states_observed: [...finalState.site.metrics.failureStatesObserved] as FailureState[],
    goals_met: outcome.goalsMet,
  };
}
