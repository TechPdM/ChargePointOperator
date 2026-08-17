import type { ReactElement } from "react";
import { FAILURE_STATE_COPY } from "../format.ts";
import { Panel } from "./Panel.tsx";
import type { Snapshot } from "../hooks/useSimulation.ts";
import type { FailureState, SimulationState } from "../../game/core/types.ts";

/**
 * The C2 workhorse. Every failure state must be diagnosable from the dashboard
 * alone, without reading raw logs — so this panel names what is going wrong,
 * why, and which lever touches it.
 *
 * It also carries the survivorship rule (KPI dictionary, binding): a falling
 * wait alongside rising abandonment is a degradation, not a win, and the panel
 * says so in those words.
 */

const WHAT_TO_TRY: Record<FailureState, string> = {
  queue_collapse: "Raise the price to thin arrivals, or cap the charging limit so bays free faster.",
  power_choke: "Try finish-soonest-first, or cap the charging limit — the supply itself can't be bought.",
  reliability_spiral: "Call out the repairs, and consider preventive maintenance.",
  margin_trap: "Capital spent here hasn't moved the goals. Nothing to undo — note it for next run.",
  trust_crash: "Cut waits and finish sessions cleanly. Trust recovers slowly.",
};

export function DiagnosisPanel({
  state,
  snapshots,
}: {
  state: SimulationState;
  snapshots: Snapshot[];
}): ReactElement {
  const m = state.site.metrics;
  const f = m.funnel;
  const active = m.failureStatesActive;
  const survivorship = detectSurvivorship(snapshots);

  // Every bucket a vehicle can end in, plus the ones still on site. Without the
  // closing-time row the shares silently stopped summing to 100% at midnight —
  // the drivers still queueing when the day ended left the funnel entirely,
  // having been counted as neither served nor lost.
  const funnelRows = [
    { label: "Served", value: f.completed, tone: "ok" },
    { label: "Still here", value: inFlight(state), tone: "info" },
    { label: "Drove past without stopping", value: f.rejectedSite, tone: "idle" },
    { label: "Turned away, no space", value: f.siteFull, tone: "warn" },
    { label: "Gave up waiting", value: f.abandonedQueue, tone: "bad" },
    { label: "Cut short by a fault", value: f.interruptedByFault, tone: "bad" },
    { label: "Still waiting when the day ended", value: f.closedAtRunEnd, tone: "idle" },
  ];

  return (
    <Panel
      title="What's going on"
      tone={active.length > 0 ? "bad" : survivorship ? "warn" : undefined}
      hint={active.length === 0 && !survivorship ? "nothing wrong" : undefined}
    >
      {active.length > 0 ? (
        <ul className="diagnosis-list">
          {active.map((name) => (
            <li key={name}>
              <div className="diagnosis-title">{FAILURE_STATE_COPY[name]?.title ?? name}</div>
              <p className="diagnosis-reads">{FAILURE_STATE_COPY[name]?.reads}</p>
              <p className="diagnosis-try">{WHAT_TO_TRY[name]}</p>
            </li>
          ))}
        </ul>
      ) : null}

      {survivorship ? (
        <div className="survivorship">
          <div className="diagnosis-title">The queue is emptying itself</div>
          <p className="diagnosis-reads">
            Average wait is falling while more drivers give up. The wait looks better because the
            impatient ones left, not because the site got faster.
          </p>
        </div>
      ) : null}

      {active.length === 0 && !survivorship ? (
        <p className="empty">The site is coping. Watch the queue and the supply bar.</p>
      ) : null}

      <div className="funnel">
        <div className="funnel-head">
          <span>Where the day's {f.arrived} drivers went</span>
        </div>
        <ul className="funnel-list">
          {funnelRows
            .filter((r) => r.value > 0)
            .map((r) => (
              <li key={r.label}>
                <span className={`swatch tone-${r.tone}`} aria-hidden="true" />
                <span className="funnel-label">{r.label}</span>
                <span className="mono">{r.value}</span>
                <span className="funnel-share">
                  {f.arrived > 0 ? Math.round((r.value / f.arrived) * 100) : 0}%
                </span>
              </li>
            ))}
        </ul>
      </div>

      {m.failureStatesObserved.length > 0 ? (
        <p className="note">
          Seen today: {m.failureStatesObserved.map((s) => FAILURE_STATE_COPY[s]?.title ?? s).join(", ")}.
        </p>
      ) : null}
    </Panel>
  );
}

function inFlight(state: SimulationState): number {
  let count = 0;
  for (const v of Object.values(state.vehicles)) {
    if (v.state !== "left" && v.state !== "complete") count += 1;
  }
  return count;
}

/**
 * The survivorship trap, made detectable: wait improving while abandonment
 * worsens across the last three snapshots (15 sim-minutes).
 *
 * Both endpoints must carry a MEASURED wait. A window in which nobody started
 * charging stores a wait of 0, and comparing against that read a site so jammed
 * that nothing moved as a wait that had fallen — inventing the improvement half
 * of the very trap this is here to catch.
 */
function detectSurvivorship(snapshots: Snapshot[]): boolean {
  if (snapshots.length < 3) return false;
  const recent = snapshots.slice(-3);
  const first = recent[0];
  const last = recent[recent.length - 1];
  if (!first || !last) return false;
  if ((first["avg_wait_started_sessions"] ?? 0) <= 0) return false;
  if ((last["avg_wait_started_sessions"] ?? 0) <= 0) return false;
  const waitFell = (last["avg_wait_seconds"] ?? 0) < (first["avg_wait_seconds"] ?? 0) - 30;
  const abandonRose =
    (last["abandonment_rate_pct"] ?? 0) > (first["abandonment_rate_pct"] ?? 0) + 3;
  return waitFell && abandonRose;
}
