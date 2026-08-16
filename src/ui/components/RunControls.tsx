import type { ReactElement } from "react";
import { ALL_SCENARIOS } from "../../game/scenarios/index.ts";
import { PLAYTEST_SEEDS } from "../../game/experiment/gateEvidence.ts";
import type { Simulation } from "../hooks/useSimulation.ts";

const SPEEDS = [1, 2, 4] as const;

/**
 * Run control. Speed changes how many ticks run per real second and never the
 * tick size (D26) — so a run played at 4× is the same run, and still replays.
 */
export function RunControls({ sim }: { sim: Simulation }): ReactElement {
  const { state } = sim;
  const finished = !state.sim.running;

  return (
    <div className="run-controls">
      <button
        type="button"
        className={`transport ${state.running ? "is-running" : ""}`}
        onClick={sim.togglePause}
        disabled={finished}
      >
        {state.running ? "Pause" : state.sim.clock.tick === 0 ? "Start the day" : "Resume"}
      </button>

      <div className="speed-group" role="group" aria-label="Speed">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            className={`speed ${state.speed === s ? "is-active" : ""}`}
            onClick={() => sim.setSpeed(s)}
          >
            {s}×
          </button>
        ))}
      </div>

      <button type="button" className="ghost" onClick={() => sim.restart()}>
        Restart
      </button>
      <button type="button" className="ghost" onClick={() => sim.restart(randomSeed(state.seed))}>
        New seed
      </button>
      <button type="button" className="ghost" onClick={sim.exportRun}>
        Save run
      </button>

      <label className="site-picker">
        <span className="visually-hidden">Seed</span>
        <select
          value={PLAYTEST_SEEDS.includes(state.seed as (typeof PLAYTEST_SEEDS)[number]) ? state.seed : "free"}
          onChange={(e) => sim.restart(e.target.value === "free" ? randomSeed(state.seed) : e.target.value)}
        >
          <option value="free">Free play</option>
          {PLAYTEST_SEEDS.map((s) => (
            <option key={s} value={s}>
              Playtest {s}
            </option>
          ))}
        </select>
      </label>

      <label className="site-picker">
        <span className="visually-hidden">Site</span>
        <select
          value={state.sim.scenario.id}
          onChange={(e) => {
            const next = ALL_SCENARIOS.find((s) => s.id === e.target.value);
            if (next) sim.loadScenario(next);
          }}
        >
          {ALL_SCENARIOS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      <span className="seed-tag" title="Same seed plus the same actions always replays identically">
        seed <b>{state.seed}</b> · tick {state.sim.clock.tick}
      </span>
    </div>
  );
}

/**
 * Seeds are strings (D26). Derived from the current one so the sequence is
 * reproducible from a written-down starting point.
 */
function randomSeed(current: string): string {
  const match = /^s(\d+)$/.exec(current);
  return match ? `s${Number(match[1]) + 1}` : `${current}-b`;
}
