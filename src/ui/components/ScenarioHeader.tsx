import type { ReactElement } from "react";
import { simClock, waveName } from "../format.ts";
import type { SimulationState } from "../../game/core/types.ts";

/**
 * The site's identity and its clock. The clock is the largest thing on the
 * page on purpose: everything else on this dashboard is only meaningful
 * relative to where you are in the day.
 */
export function ScenarioHeader({ state }: { state: SimulationState }): ReactElement {
  const progress = state.clock.secondsElapsed / state.scenario.durationSeconds;

  return (
    <header className="scenario-header">
      <div className="scenario-id">
        <span className="site-name">{state.scenario.name}</span>
        <span className="site-meta">
          {state.site.maxBays} bays · {state.site.gridPowerKw} kW supply · corridor hub
        </span>
      </div>

      <div className="clock-block">
        <div className="clock" aria-label={`Site time ${simClock(state.clock.secondsElapsed)}`}>
          {simClock(state.clock.secondsElapsed)}
        </div>
        <div className="clock-rail" role="presentation">
          <div className="clock-rail-fill" style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="clock-meta">
          <span className="wave-tag">{waveName(state)}</span>
          <span>{Math.round(state.clock.scenarioSecondsRemaining / 3_600)} h left</span>
        </div>
      </div>

      {state.result ? (
        <div className={`result-stamp result-${state.result}`}>
          <span className="result-word">{state.result === "success" ? "Day met" : "Day missed"}</span>
          <span className="result-reason">{state.resultReason?.replace(/_/g, " ")}</span>
        </div>
      ) : (
        <div className="result-stamp result-open">
          <span className="result-word">Trading</span>
          <span className="result-reason">day in progress</span>
        </div>
      )}
    </header>
  );
}
