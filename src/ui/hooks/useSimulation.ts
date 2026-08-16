/**
 * The store — D28: `useReducer` over the whole `SimulationState`.
 *
 * No business logic lives here. The UI dispatches player actions, the loop asks
 * for ticks, and everything on screen is read back out through selectors. The
 * sim core does not know this file exists.
 */

import { useCallback, useMemo, useReducer, useRef } from "react";
import { queueAction } from "../../game/actions/playerActions.ts";
import { createInitialState } from "../../game/core/init.ts";
import { tick } from "../../game/core/tick.ts";
import { snapshotData } from "../../game/systems/scoring.ts";
import { SNAPSHOT_CADENCE_SECONDS } from "../../game/core/calibration.ts";
import {
  compareRuns,
  runBaselineFor,
  summarisePlayed,
  type Comparison,
} from "../../game/experiment/compareRuns.ts";
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
  /**
   * Computed once, when the day closes: the same seed played passively. This
   * is what answers "did my decisions matter?", and it is the only way
   * `margin_trap` is detectable at all (its definition is relative to it).
   */
  comparison?: Comparison;
}

type Msg =
  | { kind: "tick" }
  | { kind: "queue"; action: PlayerActionDraft; record: Omit<ActionRecord, "id" | "atSecond"> }
  | { kind: "setSpeed"; speed: number }
  | { kind: "togglePause" }
  | { kind: "restart"; seed?: string }
  | { kind: "loadScenario"; scenario: ScenarioConfig };

const EVENT_BUFFER = 300;

function init(scenario: ScenarioConfig, seed: string): SimState {
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

      // The day just closed: score it against a passive operator on the same
      // seed. ~1,440 ticks with no logging, so it costs a few hundred ms once.
      const comparison =
        state.sim.running && !sim.running
          ? compareRuns(
              summarisePlayed(
                sim,
                state.seed,
                nextEvents.filter((e) => e.event_name === "charger.fault_detected").length,
              ),
              runBaselineFor(sim.scenario, state.seed),
            )
          : state.comparison;

      return {
        ...state,
        sim,
        events: nextEvents,
        snapshots,
        eventSeq: seq,
        comparison,
        running: sim.running ? state.running : false,
      };
    }

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
      return { ...init(state.sim.scenario, msg.seed ?? state.seed), speed: state.speed };

    case "loadScenario":
      // A different site is a different game; nothing carries over but speed.
      return { ...init(msg.scenario, state.seed), speed: state.speed };
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
  exportNdjson: () => void;
}

export function useSimulation(scenario: ScenarioConfig, seed: string): Simulation {
  const [state, dispatch] = useReducer(reduce, undefined, () => init(scenario, seed));
  const stateRef = useRef(state);
  stateRef.current = state;

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

  const exportNdjson = useCallback(() => {
    const current = stateRef.current;
    // The run envelope is stamped here rather than in the sim, so run identity
    // never reaches hashed state (C11).
    const lines = current.events.map((e) =>
      JSON.stringify({
        log_schema_version: 1,
        service: "chargepoint-operator-mvp",
        environment: "dev",
        app_version: "0.1.0-phase2",
        run_id: `browser-${current.seed}`,
        scenario_id: current.sim.scenario.id,
        seed: current.seed,
        ...e,
      }),
    );
    const blob = new Blob([lines.join("\n")], { type: "application/x-ndjson" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${current.sim.scenario.id}-${current.seed}.ndjson`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  return useMemo(
    () => ({ state, act, advance, setSpeed, togglePause, restart, loadScenario, exportNdjson }),
    [state, act, advance, setSpeed, togglePause, restart, loadScenario, exportNdjson],
  );
}
