import type { ReactElement } from "react";
import { ARCHETYPE_LABEL, minutes } from "../format.ts";
import { Empty, Panel } from "./Panel.tsx";
import type { SimulationState } from "../../game/core/types.ts";

/**
 * Who is waiting, how long they have waited, and how close they are to giving
 * up. Patience is per archetype (Calibration §3), so the bar is the honest
 * answer to "will this person still be here in five minutes?".
 */
export function ActiveQueueTable({ state }: { state: SimulationState }): ReactElement {
  const now = state.clock.secondsElapsed;

  return (
    <Panel
      title="Waiting"
      hint={`${state.queue.length} of ${state.scenario.maxQueueLength} spaces`}
    >
      {state.queue.length === 0 ? (
        <Empty>No one waiting.</Empty>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Driver</th>
              <th className="num">Battery</th>
              <th className="num">Waited</th>
              <th>Patience</th>
            </tr>
          </thead>
          <tbody>
            {state.queue.map((entry) => {
              const v = state.vehicles[entry.vehicleId];
              if (!v) return null;
              const waited = now - entry.queuedAtSecond;
              const patience = Math.min(1, waited / v.demand.patienceSeconds);
              return (
                <tr key={entry.vehicleId}>
                  <td>{ARCHETYPE_LABEL[v.archetype]}</td>
                  <td className="num mono">{Math.round(v.currentSoc * 100)}%</td>
                  <td className="num mono">{minutes(waited)}</td>
                  <td>
                    <span
                      className={`patience ${patience >= 1 ? "is-spent" : patience > 0.7 ? "is-thin" : ""}`}
                      title={
                        patience >= 1
                          ? "Out of patience — may leave at any moment"
                          : `${minutes(v.demand.patienceSeconds - waited)} min before they start considering leaving`
                      }
                    >
                      <span className="patience-fill" style={{ width: `${patience * 100}%` }} />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
