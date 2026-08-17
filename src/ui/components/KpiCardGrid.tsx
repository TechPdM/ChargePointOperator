import type { ReactElement } from "react";
import { cumulativeMargin } from "../../game/systems/economics.ts";
import {
  rollAvgWaitSeconds,
  rollUptimeFraction,
  rollWindow,
} from "../../game/core/selectors.ts";
import {
  demandFractionElapsed,
  money,
  minutes,
  pct,
  queuePressureOf,
  toneFor,
  type Tone,
} from "../format.ts";
import type { SimulationState } from "../../game/core/types.ts";

/**
 * The KPI strip.
 *
 * **Binding rule (KPI dictionary, same status as the C2 explainability rule):**
 * the abandonment card is rendered immediately after average wait. Wait can
 * improve purely because everyone impatient gave up, and a player must never
 * be able to see the first number without the second.
 */
export function KpiCardGrid({ state }: { state: SimulationState }): ReactElement {
  const m = state.site.metrics;
  const goals = state.scenario.goals;
  const margin = cumulativeMargin(state);
  const cumWait = m.cumStartedSessions > 0 ? m.cumWaitSecondsSum / m.cumStartedSessions : 0;

  // Read through the same ROLL helpers the sim and the logs use, so the three
  // cannot drift — but take the `null` these return for an empty window rather
  // than the stored fallback. A card that shows a green "0.0 min" wait or a
  // green "100%" uptime because there was nothing to measure is worse than one
  // that admits it: those are exactly the moments a jammed or shut site
  // produces, so the fallback flatters precisely when it must not.
  const roll = rollWindow(state);
  const waitSeconds = rollAvgWaitSeconds(roll);
  const uptimeFraction = rollUptimeFraction(roll);

  // Cumulative goals are scored at midnight, so judging them against the full
  // target at 03:00 would paint the strip red all morning and teach players to
  // ignore it. They're judged against the share of the day's DEMAND that has
  // arrived so far — a quiet 4am is not "behind".
  const demandGone = demandFractionElapsed(state);
  const onPace = (value: number, goal: number): number =>
    demandGone < 0.05 ? 1 : value / (goal * demandGone);

  return (
    <div className="kpi-strip">
      <Kpi
        label="Cash"
        value={money(state.site.economics.cash)}
        tone="idle"
        detail={`Started at ${money(state.scenario.initialCash)}. Not a goal — the scored figure is margin.`}
      />
      <Kpi
        label="Operating margin"
        value={money(margin)}
        unit="today"
        tone={toneFor(onPace(margin, goals.minOperatingMargin), 1, 0.7)}
        detail={`Revenue minus energy, maintenance and rent. Capital spending is excluded. Goal ${money(goals.minOperatingMargin)} by midnight — the colour tracks whether you're on pace for it, measured against how much of the day's traffic has been through.`}
        goal={`${money(margin)} of ${money(goals.minOperatingMargin)}`}
      />
      <Kpi
        label="Trust"
        value={m.trust.toFixed(1)}
        unit="/ 100"
        tone={toneFor(m.trust, goals.minTrust, 40)}
        detail={`Reputation, earned and lost across the day. Goal ${goals.minTrust}.`}
      />
      <Kpi
        label="Uptime"
        value={uptimeFraction === null ? "—" : pct(uptimeFraction * 100, 1)}
        unit={uptimeFraction === null ? "nothing measured" : "%"}
        tone={uptimeFraction === null ? "idle" : toneFor(uptimeFraction * 100, 95, 90)}
        detail={
          uptimeFraction === null
            ? "No open bay-time in the last 15 minutes — either the day hasn't started or you have closed everything. Nothing to report either way."
            : "Share of open bay-time actually able to charge. Bays you closed yourself don't count against it."
        }
      />
      <Kpi
        label="Utilisation"
        value={pct(m.utilizationPct, 0)}
        unit="%"
        tone="idle"
        detail="Share of working bay-time with a car plugged in."
      />
      <Kpi
        label="Queue"
        value={String(m.queueLength)}
        unit={`waiting · ${queuePressureOf(state).toFixed(1)} per bay`}
        tone={toneFor(queuePressureOf(state), 0.5, 1.5)}
        detail={`Capacity ${state.scenario.maxQueueLength}. Beyond that, drivers are turned away at the entrance.`}
      />

      {/* Welded into one cell, not merely placed next to each other. Card order
          alone does not survive a change of column count — at three columns
          these two landed diagonally opposite, which is exactly the reading the
          rule exists to prevent.

          It sits second-to-last so that, spanning two of the three tracks, it
          fills the last row alongside Served — nine cards, three clean rows. */}
      <div className="kpi-duo">
      <Kpi
        label="Average wait"
        value={waitSeconds === null ? "—" : minutes(waitSeconds)}
        unit={waitSeconds === null ? "nobody plugged in" : "min"}
        tone={waitSeconds === null ? "idle" : toneFor(waitSeconds, 300, goals.maxAvgWaitSeconds)}
        detail={
          waitSeconds === null
            ? `Nobody has started charging in the last 15 minutes, so there is no wait to average. That is not a good sign when there is a queue. Across the day so far: ${minutes(cumWait)} min against a goal of ${minutes(goals.maxAvgWaitSeconds)}.`
            : `How long drivers queued before plugging in. Goal ${minutes(goals.maxAvgWaitSeconds)} min across the day — currently ${minutes(cumWait)} min.`
        }
        goal={`${minutes(cumWait)} of ${minutes(goals.maxAvgWaitSeconds)} min`}
      />
      <Kpi
        label="Gave up waiting"
        value={pct(m.abandonmentRatePct, 1)}
        unit="%"
        tone={toneFor(m.abandonmentRatePct, 5, 20)}
        detail="Share of committed drivers who left the queue. Read this next to average wait: a falling wait with a rising figure here means the queue emptied itself."
        pairedWith="↤ read together"
      />
      </div>

      <Kpi
        label="Served"
        value={String(m.sessionsCompleted)}
        unit={`of ${goals.minSessionsCompleted} goal`}
        tone={toneFor(onPace(m.sessionsCompleted, goals.minSessionsCompleted), 1, 0.7)}
        detail={`${m.kwhDelivered.toFixed(0)} kWh delivered. ${pct(m.sessionSuccessRatePct, 0)}% of started sessions finished without a fault.`}
      />
    </div>
  );
}

interface KpiProps {
  label: string;
  value: string;
  unit?: string;
  tone: Tone;
  detail: string;
  goal?: string;
  pairedWith?: string;
}

function Kpi({ label, value, unit, tone, detail, goal, pairedWith }: KpiProps): ReactElement {
  return (
    <article className={`kpi tone-${tone}`} tabIndex={0}>
      <div className="kpi-label">
        {label}
        {pairedWith ? <span className="kpi-pair">{pairedWith}</span> : null}
      </div>
      <div className="kpi-value">
        {value}
        {unit ? <span className="kpi-unit">{unit}</span> : null}
      </div>
      {goal ? <div className="kpi-goal">{goal}</div> : null}
      <div className="kpi-detail" role="tooltip">
        {detail}
      </div>
    </article>
  );
}
