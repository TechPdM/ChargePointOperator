/**
 * KPI update and outcome checking.
 *
 * Every percentage here is derived from accumulators; nothing stores a rate and
 * its inputs separately (KPI dictionary, "Computation notes") — that is how the
 * two drift apart.
 */

import { ROLL_WINDOW_SECONDS, TICK_SAMPLE_WINDOW } from "../core/calibration.ts";
import { bayList, pct, round, type TickContext } from "../core/context.ts";
import {
  isBusy,
  isDown,
  rollAbandonmentFraction,
  rollAvgWaitSeconds,
  rollUptimeFraction,
  rollUtilizationFraction,
  rollWindow,
} from "../core/selectors.ts";
import type { ScenarioGoals, SimulationState } from "../core/types.ts";
import { cumulativeMargin } from "./economics.ts";

/**
 * Bay-time accounting. Each bay is attributed to exactly one bucket per tick,
 * read at the end of the tick after all transitions have landed.
 */
function accumulateBayTime(ctx: TickContext): void {
  const { state } = ctx;
  const m = state.site.metrics;

  for (const bay of bayList(state)) {
    if (bay.isOpen) {
      m.openBaySeconds += ctx.delta;
      ctx.sample.openBaySeconds += ctx.delta;
    }

    if (bay.state === "faulted") {
      m.downtimeFaultSeconds += ctx.delta;
      ctx.sample.faultSeconds += ctx.delta;
    } else if (bay.state === "repairing") {
      m.downtimeRepairSeconds += ctx.delta;
      ctx.sample.repairSeconds += ctx.delta;
    } else if (!bay.isOpen) {
      // Player-closed time is tracked but excluded from the uptime denominator —
      // closing a bay is a capacity decision, not unreliability (KPI dict).
      m.downtimeClosedSeconds += ctx.delta;
    }

    if (isBusy(bay)) {
      m.occupiedBaySeconds += ctx.delta;
      ctx.sample.occupiedBaySeconds += ctx.delta;
    }
  }
}

export function updateKPIs(ctx: TickContext): void {
  const { state } = ctx;

  accumulateBayTime(ctx);
  ctx.sample.queueLength = state.queue.length;

  // The sample must be on the ring before ROLL metrics are read, or every
  // window is one tick stale.
  state.tickSamples.push(ctx.sample);
  if (state.tickSamples.length > TICK_SAMPLE_WINDOW) {
    state.tickSamples.splice(0, state.tickSamples.length - TICK_SAMPLE_WINDOW);
  }

  recomputeDerivedKPIs(state);
}

/**
 * Derived-only refresh. The close-out sweep calls this rather than `updateKPIs`
 * so it does not accumulate a second tick of bay-time for the same tick.
 */
export function recomputeDerivedKPIs(state: SimulationState): void {
  const m = state.site.metrics;
  const roll = rollWindow(state);

  m.queueLength = state.queue.length;
  m.uptimePct = round(rollUptimeFraction(roll) * 100, 2);
  m.utilizationPct = round(rollUtilizationFraction(roll) * 100, 2);
  m.abandonmentRatePct = round(rollAbandonmentFraction(roll) * 100, 2);
  m.avgWaitSeconds = round(rollAvgWaitSeconds(roll), 1);

  const windowHours = Math.max(1e-9, roll.samples * state.clock.deltaSeconds) / 3_600;
  m.powerUtilizationPct = round(
    Math.min(100, (roll.kwhDelivered / (state.site.gridPowerKw * windowHours)) * 100),
    2,
  );
  m.throughputVehiclesPerHour = round(roll.sessionsCompleted / windowHours, 2);

  const f = m.funnel;
  // completedWithoutFault / sessionsStarted. Interrupted sessions never land in
  // `completed`, so `completed` IS the without-fault count.
  m.sessionSuccessRatePct =
    f.sessionsStarted > 0 ? round((f.completed / f.sessionsStarted) * 100, 2) : 100;
  // accepted = passed admission and wasn't turned away by site_full.
  const accepted = f.arrived - f.rejectedSite - f.siteFull;
  const acceptedDenominator = accepted - f.closedAtRunEnd;
  m.chargeStartSuccessRatePct =
    acceptedDenominator > 0 ? round((f.sessionsStarted / acceptedDenominator) * 100, 2) : 100;

  m.kwhDelivered = round(m.kwhDelivered, 4);
}

export interface GoalOutcome {
  goalsMet: Record<keyof ScenarioGoals, boolean>;
  allMet: boolean;
  cumMargin: number;
  cumAvgWaitSeconds: number;
}

export function evaluateGoals(state: SimulationState): GoalOutcome {
  const goals = state.scenario.goals;
  const m = state.site.metrics;
  const cumMargin = cumulativeMargin(state);
  const cumAvgWait =
    m.cumStartedSessions > 0 ? m.cumWaitSecondsSum / m.cumStartedSessions : 0;

  const goalsMet: Record<keyof ScenarioGoals, boolean> = {
    minTrust: m.trust >= goals.minTrust,
    minOperatingMargin: cumMargin >= goals.minOperatingMargin,
    maxAvgWaitSeconds: cumAvgWait <= goals.maxAvgWaitSeconds,
    minSessionsCompleted: m.sessionsCompleted >= goals.minSessionsCompleted,
  };

  return {
    goalsMet,
    allMet: Object.values(goalsMet).every(Boolean),
    cumMargin,
    cumAvgWaitSeconds: cumAvgWait,
  };
}

/** Hard fails only (D24 keeps failure states detection-only). */
export function checkScenarioOutcome(ctx: TickContext): void {
  const { state } = ctx;
  const rules = state.scenario.failRules;
  const m = state.site.metrics;

  if (state.site.economics.cash < rules.bankruptcyCashBelow) {
    state.running = false;
    state.result = "fail";
    state.resultReason = "bankruptcy";
    return;
  }

  if (m.trust < rules.trustBelow) {
    if (state.detectors.trustBelowFailSince === undefined) {
      state.detectors.trustBelowFailSince = state.clock.secondsElapsed;
    } else if (
      state.clock.secondsElapsed - state.detectors.trustBelowFailSince >=
      rules.trustBelowForSeconds
    ) {
      state.running = false;
      state.result = "fail";
      state.resultReason = "trust_collapse";
      return;
    }
  } else {
    state.detectors.trustBelowFailSince = undefined;
  }
}

/** Payload for `metric.snapshot` — every KPI at ROLL and CUM scope (D9). */
export function snapshotData(state: SimulationState): Record<string, number> {
  const m = state.site.metrics;
  const e = state.site.economics;
  const roll = rollWindow(state);
  const outcome = evaluateGoals(state);
  const cumUptimeDenominator = Math.max(1e-9, m.openBaySeconds);

  return {
    roll_window_seconds: ROLL_WINDOW_SECONDS,
    cash_amount: round(e.cash, 2),
    trust: round(m.trust, 2),
    uptime_pct: m.uptimePct,
    cum_uptime_pct: pct(
      Math.max(0, 1 - (m.downtimeFaultSeconds + m.downtimeRepairSeconds) / cumUptimeDenominator),
    ),
    utilization_pct: m.utilizationPct,
    power_utilization_pct: m.powerUtilizationPct,
    avg_wait_seconds: m.avgWaitSeconds,
    cum_avg_wait_seconds: round(outcome.cumAvgWaitSeconds, 1),
    queue_length: m.queueLength,
    abandonment_rate_pct: m.abandonmentRatePct,
    cum_abandonment_rate_pct: pct(
      m.funnel.abandonedQueue /
        Math.max(1, m.funnel.abandonedQueue + m.funnel.sessionsStarted),
    ),
    sessions_completed: m.sessionsCompleted,
    session_success_rate_pct: m.sessionSuccessRatePct,
    charge_start_success_rate_pct: m.chargeStartSuccessRatePct,
    kwh_delivered: round(m.kwhDelivered, 2),
    throughput_vehicles_per_hour: m.throughputVehiclesPerHour,
    margin_roll_amount: round(roll.margin, 2),
    cum_margin_amount: round(outcome.cumMargin, 2),
    revenue_cum_amount: round(e.revenueToday, 2),
    energy_cost_cum_amount: round(e.energyCostToday, 2),
    maintenance_cost_cum_amount: round(e.maintenanceCostToday, 2),
    opex_cum_amount: round(e.opexAccruedToday, 2),
    capex_cum_amount: round(e.capexSpentToday, 2),
    downtime_fault_seconds: m.downtimeFaultSeconds,
    downtime_repair_seconds: m.downtimeRepairSeconds,
    downtime_closed_seconds: m.downtimeClosedSeconds,
    allocated_power_kw: round(roll.meanAllocatedPowerKw, 1),
    bays_down: bayList(state).filter(isDown).length,
  };
}
