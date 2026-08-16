import type { ReactElement } from "react";
import { cumulativeMargin } from "../../game/systems/economics.ts";
import { evaluateGoals } from "../../game/systems/scoring.ts";
import { FAILURE_STATE_COPY, minutes, money } from "../format.ts";
import type { Comparison } from "../../game/experiment/compareRuns.ts";
import type { ScenarioGoals, SimulationState } from "../../game/core/types.ts";

/**
 * The end-of-day report — O5, and the answer to the last of the three
 * questions every playtester is asked: *did it work, and how do you know?*
 *
 * Two halves, deliberately. **Goals** says whether you met the brief.
 * **Versus doing nothing** says whether you were the reason — the same day,
 * same seed, played passively. Without that second half a player has no way to
 * tell a good decision from a kind seed, and neither does the gate.
 */

const GOAL_COPY: Record<keyof ScenarioGoals, { label: string; format: (v: number) => string }> = {
  minOperatingMargin: { label: "Operating margin", format: (v) => money(v) },
  maxAvgWaitSeconds: { label: "Average wait", format: (v) => `${minutes(v)} min` },
  minTrust: { label: "Trust", format: (v) => v.toFixed(1) },
  minSessionsCompleted: { label: "Drivers served", format: (v) => String(v) },
};

export function PostRunSummary({
  state,
  comparison,
}: {
  state: SimulationState;
  comparison?: Comparison;
}): ReactElement | null {
  if (state.running) return null;

  const outcome = evaluateGoals(state);
  const m = state.site.metrics;
  const goals = state.scenario.goals;
  const actual: Record<keyof ScenarioGoals, number> = {
    minOperatingMargin: cumulativeMargin(state),
    maxAvgWaitSeconds: outcome.cumAvgWaitSeconds,
    minTrust: m.trust,
    minSessionsCompleted: m.sessionsCompleted,
  };

  return (
    <section className={`panel post-run ${outcome.allMet ? "is-win" : "is-loss"}`}>
      <div className="panel-head">
        <h2>End of day — {state.scenario.name}</h2>
        <span className="panel-hint">
          {outcome.allMet ? "all four goals met" : `${4 - Object.values(outcome.goalsMet).filter(Boolean).length} goal(s) missed`}
        </span>
      </div>

      <div className="panel-body post-run-body">
        <div className="post-run-col">
          <h3>Goals</h3>
          <ul className="goal-list">
            {(Object.keys(GOAL_COPY) as (keyof ScenarioGoals)[]).map((key) => {
              const met = outcome.goalsMet[key];
              const copy = GOAL_COPY[key];
              return (
                <li key={key} className={met ? "is-met" : "is-missed"}>
                  <span className="goal-mark" aria-hidden="true">
                    {met ? "✓" : "✗"}
                  </span>
                  <span className="goal-label">{copy.label}</span>
                  <span className="mono goal-actual">{copy.format(actual[key])}</span>
                  <span className="goal-target">
                    {key === "maxAvgWaitSeconds" ? "≤" : "≥"} {copy.format(goals[key])}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="post-run-col">
          <h3>Versus doing nothing</h3>
          {comparison ? (
            <>
              <ul className="goal-list">
                <Delta label="Operating margin" value={comparison.deltas["cumMargin"] ?? 0} good="up" format={money} />
                <Delta
                  label="Drivers served"
                  value={comparison.deltas["sessionsCompleted"] ?? 0}
                  good="up"
                  format={(v) => String(Math.round(v))}
                />
                <Delta
                  label="Average wait"
                  value={comparison.deltas["cumAvgWaitSeconds"] ?? 0}
                  good="down"
                  format={(v) => `${minutes(v)} min`}
                />
                <Delta label="Trust" value={comparison.deltas["trust"] ?? 0} good="up" format={(v) => v.toFixed(1)} />
              </ul>
              <p className="note">
                The same day, same seed, run by an operator who changed nothing and only called out
                repairs. It met {comparison.baseline.goalsMetCount} of 4 goals.
              </p>
              {comparison.marginTrap ? (
                <div className="survivorship">
                  <div className="diagnosis-title">Margin trap</div>
                  <p className="diagnosis-reads">
                    You spent {money(comparison.played.capexSpent)} of capital and finished no
                    further ahead than doing nothing would have. The hardware wasn't the
                    constraint.
                  </p>
                </div>
              ) : null}
            </>
          ) : (
            <p className="empty">Comparison unavailable — the run was reset before it finished.</p>
          )}
        </div>

        <div className="post-run-col">
          <h3>What the day did to you</h3>
          <ul className="goal-list">
            <li>
              <span className="goal-label">Turned away at the entrance</span>
              <span className="mono goal-actual">{m.funnel.rejectedSite}</span>
              <span className="goal-target">
                {m.funnel.arrived > 0
                  ? `${Math.round((m.funnel.rejectedSite / m.funnel.arrived) * 100)}% of arrivals`
                  : ""}
              </span>
            </li>
            <li>
              <span className="goal-label">Gave up waiting</span>
              <span className="mono goal-actual">{m.funnel.abandonedQueue}</span>
              <span className="goal-target">{m.sessionsAbandoned > 0 ? "queue too long" : ""}</span>
            </li>
            <li>
              <span className="goal-label">Cut short by a fault</span>
              <span className="mono goal-actual">{m.funnel.interruptedByFault}</span>
              <span className="goal-target">{m.funnel.interruptedByFault > 0 ? "−2 trust each" : ""}</span>
            </li>
            <li>
              <span className="goal-label">Energy sold</span>
              <span className="mono goal-actual">{m.kwhDelivered.toFixed(0)} kWh</span>
              <span className="goal-target" />
            </li>
          </ul>
          {m.failureStatesObserved.length > 0 ? (
            <p className="note">
              Trouble seen today:{" "}
              {m.failureStatesObserved.map((f) => FAILURE_STATE_COPY[f]?.title ?? f).join(", ")}.
            </p>
          ) : (
            <p className="note">No failure states today — the site held together.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function Delta({
  label,
  value,
  good,
  format,
}: {
  label: string;
  value: number;
  good: "up" | "down";
  format: (v: number) => string;
}): ReactElement {
  const better = good === "up" ? value > 0 : value < 0;
  const negligible = Math.abs(value) < 0.05;
  return (
    <li className={negligible ? "" : better ? "is-met" : "is-missed"}>
      {/* The arrow shows which way the NUMBER moved; the colour and the word
          say whether that is good. A wait that rose is ▲ and "worse". */}
      <span className="goal-mark" aria-hidden="true">
        {negligible ? "–" : value > 0 ? "▲" : "▼"}
      </span>
      <span className="goal-label">{label}</span>
      <span className="mono goal-actual">
        {value > 0 ? "+" : ""}
        {format(value)}
      </span>
      <span className="goal-target">{negligible ? "no real change" : better ? "better" : "worse"}</span>
    </li>
  );
}
