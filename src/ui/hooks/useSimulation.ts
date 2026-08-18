/**
 * The store — D28: `useReducer` over the whole `SimulationState`.
 *
 * No business logic lives here. The UI dispatches player actions, the loop asks
 * for ticks, and everything on screen is read back out through selectors. The
 * sim core does not know this file exists.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { queueAction } from "../../game/actions/playerActions.ts";
import { createInitialState } from "../../game/core/init.ts";
import { tick } from "../../game/core/tick.ts";
import { evaluateGoals, snapshotData } from "../../game/systems/scoring.ts";
import { hashState } from "../../game/core/rng.ts";
import { APP_VERSION } from "../../game/logging/logger.ts";
import { PLAYTEST_SEEDS } from "../../game/experiment/gateEvidence.ts";
import type { RunManifest } from "../../game/logging/schema.ts";
import { SNAPSHOT_CADENCE_SECONDS } from "../../game/core/calibration.ts";
import {
  compareRuns,
  runBaselineFor,
  summarisePlayed,
  type Comparison,
} from "../../game/experiment/compareRuns.ts";
import { findScenario } from "../../game/scenarios/index.ts";
import type {
  BaselineRequest,
  BaselineResponse,
} from "../workers/baseline.worker.ts";
import type { PendingLogEvent } from "../../game/logging/schema.ts";
import type {
  PlayerActionDraft,
  ScenarioConfig,
  SimulationState,
} from "../../game/core/types.ts";

/** One row per `metric.snapshot`, flattened for the trend charts. */
export interface Snapshot {
  atSecond: number;
  [key: string]: number;
}

/** A player action as it appears in the action history panel. */
export interface ActionRecord {
  id: string;
  atSecond: number;
  label: string;
  detail: string;
}

export interface LoggedEvent extends PendingLogEvent {
  key: number;
}

export interface SimState {
  sim: SimulationState;
  snapshots: Snapshot[];
  events: LoggedEvent[];
  actions: ActionRecord[];
  /** Real-time speed multiplier; never changes the tick size (D26). */
  speed: number;
  running: boolean;
  seed: string;
  eventSeq: number;
  /** Stamped when the run is created — the manifest's only wall-clock field. */
  startedAtUtc: string;
  initialStateHash: string;
  /**
   * Monotonic run counter. `startedAtUtc` already identifies a run, but only to
   * the millisecond; this is what a late baseline reply is checked against, and
   * a stale reply landing on a fresh run would be a wrong score rather than a
   * slow one.
   */
  runSeq: number;
  /**
   * The day has closed and the baseline is being run. Distinct from "no
   * comparison": the report has a legitimate second or two with nothing in its
   * right-hand column, and it should say so rather than claim the run was reset.
   */
  scoring: boolean;
  /**
   * Computed once, when the day closes: the same seed played passively. This
   * is what answers "did my decisions matter?", and it is the only way
   * `margin_trap` is detectable at all (its definition is relative to it).
   *
   * Runs in a worker, not here — see the scoring effect below.
   */
  comparison?: Comparison;
}

type Msg =
  | { kind: "tick" }
  | { kind: "queue"; action: PlayerActionDraft; record: Omit<ActionRecord, "id" | "atSecond"> }
  | { kind: "setSpeed"; speed: number }
  | { kind: "togglePause" }
  | { kind: "restart"; seed?: string }
  | { kind: "loadScenario"; scenario: ScenarioConfig }
  | { kind: "scored"; runSeq: number; comparison: Comparison };

const EVENT_BUFFER = 300;

function init(scenario: ScenarioConfig, seed: string, runSeq: number): SimState {
  const sim = createInitialState(scenario, seed);
  return {
    sim,
    snapshots: [{ atSecond: 0, ...snapshotData(sim) }],
    events: [],
    actions: [],
    speed: 1,
    running: false,
    seed,
    eventSeq: 0,
    startedAtUtc: new Date().toISOString(),
    initialStateHash: hashState(sim),
    runSeq,
    scoring: false,
  };
}

function reduce(state: SimState, msg: Msg): SimState {
  switch (msg.kind) {
    case "tick": {
      if (!state.running || !state.sim.running) return state;
      const { state: sim, events } = tick(state.sim, { invariants: "collect" });

      let seq = state.eventSeq;
      const kept = events
        .filter((e) => e.event_name !== "metric.snapshot")
        .map((e) => ({ ...e, key: seq++ }));
      const nextEvents =
        kept.length === 0
          ? state.events
          : [...state.events, ...kept].slice(-EVENT_BUFFER);

      const snapshots =
        sim.clock.secondsElapsed % SNAPSHOT_CADENCE_SECONDS === 0 || !sim.running
          ? [...state.snapshots, { atSecond: sim.clock.secondsElapsed, ...snapshotData(sim) }]
          : state.snapshots;

      // The day just closed. Only flag it for scoring here — the baseline is a
      // full 1,440-tick run, and doing it inline froze the dashboard for
      // seconds at the moment the player was waiting to read their score. The
      // effect below picks this up and hands it to a worker.
      const justEnded = state.sim.running && !sim.running;

      return {
        ...state,
        sim,
        events: nextEvents,
        snapshots,
        eventSeq: seq,
        scoring: justEnded ? true : state.scoring,
        running: sim.running ? state.running : false,
      };
    }

    case "scored":
      // A reply for a run the player has already left behind is not a score,
      // it is a wrong score. Drop it.
      if (msg.runSeq !== state.runSeq) return state;
      return { ...state, comparison: msg.comparison, scoring: false };

    case "queue": {
      const id = `a-${state.sim.clock.tick}-${state.actions.length}`;
      return {
        ...state,
        sim: queueAction(state.sim, msg.action, id),
        actions: [
          { id, atSecond: state.sim.clock.secondsElapsed, ...msg.record },
          ...state.actions,
        ].slice(0, 60),
      };
    }

    case "setSpeed":
      return { ...state, speed: msg.speed };

    case "togglePause":
      // Only the run's own end can stop it for good; pause is a UI concern.
      return state.sim.running ? { ...state, running: !state.running } : state;

    case "restart":
      return {
        ...init(state.sim.scenario, msg.seed ?? state.seed, state.runSeq + 1),
        speed: state.speed,
      };

    case "loadScenario":
      // A different site is a different game; nothing carries over but speed.
      return { ...init(msg.scenario, state.seed, state.runSeq + 1), speed: state.speed };
  }
}

export interface Simulation {
  state: SimState;
  /** Dispatch a player action; it applies at the top of the next tick (C8). */
  act: (action: PlayerActionDraft, record: Omit<ActionRecord, "id" | "atSecond">) => void;
  advance: () => void;
  setSpeed: (speed: number) => void;
  togglePause: () => void;
  restart: (seed?: string) => void;
  loadScenario: (scenario: ScenarioConfig) => void;
  exportRun: () => void;
}

export function useSimulation(scenario: ScenarioConfig, seed: string): Simulation {
  const [state, dispatch] = useReducer(reduce, undefined, () => init(scenario, seed, 0));
  const stateRef = useRef(state);
  stateRef.current = state;

  /**
   * Score the closed day against a passive operator on the same seed.
   *
   * This is a whole second simulation — ~1.8s on the roadside hub — and it used
   * to run inside the reducer, which meant the browser sat frozen through it.
   * It runs in a worker now, so the final board paints immediately and the
   * comparison fills in behind it.
   *
   * Guarded by `requested`, not by `scoring` alone: StrictMode runs effects
   * twice, and two baselines for one day is pure waste even off-thread.
   */
  const worker = useRef<Worker | null>(null);
  const requested = useRef<number | null>(null);
  /**
   * The request the worker is currently chewing on. Held in a ref rather than
   * captured by the error handler: the handler is registered once, with the
   * worker, and a closure over the first day's request would score run 1's
   * numbers if the worker fell over on run 4.
   */
  const inFlight = useRef<BaselineRequest | null>(null);

  useEffect(() => {
    if (!state.scoring || requested.current === state.runSeq) return;
    requested.current = state.runSeq;

    const current = stateRef.current;
    const request: BaselineRequest = {
      runSeq: current.runSeq,
      scenarioId: current.sim.scenario.id,
      seed: current.seed,
      played: summarisePlayed(
        current.sim,
        current.seed,
        current.events.filter((e) => e.event_name === "charger.fault_detected").length,
      ),
    };
    inFlight.current = request;

    // Falling back rather than giving up: without a comparison there is no
    // `margin_trap` at all (D6), so a failed worker has to cost a freeze rather
    // than a missing failure state.
    const scoreOnMainThread = (): void => {
      const req = inFlight.current;
      if (!req) return;
      inFlight.current = null;
      dispatch({
        kind: "scored",
        runSeq: req.runSeq,
        comparison: compareRuns(
          req.played,
          runBaselineFor(findScenario(req.scenarioId), req.seed),
        ),
      });
    };

    if (!worker.current) {
      try {
        worker.current = new Worker(new URL("../workers/baseline.worker.ts", import.meta.url), {
          type: "module",
        });
        worker.current.addEventListener("message", (event: MessageEvent<BaselineResponse>) => {
          inFlight.current = null;
          dispatch({ kind: "scored", ...event.data });
        });
        worker.current.addEventListener("error", scoreOnMainThread);
      } catch {
        worker.current = null;
      }
    }

    if (worker.current) worker.current.postMessage(request);
    else scoreOnMainThread();
  }, [state.scoring, state.runSeq]);

  useEffect(() => () => worker.current?.terminate(), []);

  const act = useCallback<Simulation["act"]>((action, record) => {
    dispatch({ kind: "queue", action, record });
  }, []);

  const advance = useCallback(() => dispatch({ kind: "tick" }), []);
  const setSpeed = useCallback((speed: number) => dispatch({ kind: "setSpeed", speed }), []);
  const togglePause = useCallback(() => dispatch({ kind: "togglePause" }), []);
  const restart = useCallback((s?: string) => dispatch({ kind: "restart", seed: s }), []);
  const loadScenario = useCallback(
    (scenario: ScenarioConfig) => dispatch({ kind: "loadScenario", scenario }),
    [],
  );

  /**
   * Export the run as a `RunLogBundle` — manifest plus NDJSON events.
   *
   * Playtest protocol §1 requires "run manifests + full NDJSON logs saved per
   * run, labelled `tester-run`". A bare event stream is not enough: the
   * manifest is what carries the seed, the outcome, the goals met and
   * `failure_states_observed`, which is what criterion 3 is counted from.
   */
  const exportRun = useCallback(() => {
    const current = stateRef.current;
    const isPlaytestSeed = PLAYTEST_SEEDS.includes(current.seed as (typeof PLAYTEST_SEEDS)[number]);
    const runId = `${isPlaytestSeed ? "tester" : "browser"}-${current.sim.scenario.id}-${current.seed}`;

    const envelope = {
      log_schema_version: 1 as const,
      service: "chargepoint-operator-mvp" as const,
      environment: "dev" as const,
      app_version: APP_VERSION,
      run_id: runId,
      scenario_id: current.sim.scenario.id,
      seed: current.seed,
    };

    const manifest: RunManifest = {
      run_id: runId,
      scenario_id: current.sim.scenario.id,
      seed: current.seed,
      app_version: APP_VERSION,
      // Wall-clock exists only here (C11) — never in sim state.
      started_at_utc: current.startedAtUtc,
      completed_at_utc: new Date().toISOString(),
      outcome: current.sim.result ?? "aborted",
      duration_sim_seconds: current.sim.clock.secondsElapsed,
      tick_count: current.sim.clock.tick,
      initial_state_hash: current.initialStateHash,
      final_state_hash: hashState(current.sim),
      policy_label: isPlaytestSeed ? "tester-run" : "played",
      failure_states_observed: [...current.sim.site.metrics.failureStatesObserved],
      goals_met: evaluateGoals(current.sim).goalsMet,
      notes: `${current.actions.length} player actions`,
    };

    const bundle = {
      manifest,
      events: current.events.map((e) => ({ ...envelope, ...e })),
      actions: current.actions,
    };

    download(`${runId}.json`, JSON.stringify(bundle, null, 2), "application/json");
    download(
      `${runId}.ndjson`,
      bundle.events.map((e) => JSON.stringify(e)).join("\n"),
      "application/x-ndjson",
    );
  }, []);

  return useMemo(
    () => ({ state, act, advance, setSpeed, togglePause, restart, loadScenario, exportRun }),
    [state, act, advance, setSpeed, togglePause, restart, loadScenario, exportRun],
  );
}

function download(filename: string, contents: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
