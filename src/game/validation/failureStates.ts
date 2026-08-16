/**
 * Failure-state and alert detection — D24, KPI dictionary §"Failure states".
 *
 * These are DETECTION rules, not fail conditions: they never end a run. They
 * emit `failure_state.entered` / `failure_state.cleared`, accumulate into
 * `RunManifest.failure_states_observed`, and drive the DiagnosisPanel — which
 * is what turns gate criterion 3 from a judgement call into a count.
 *
 * The dual conditions are deliberate. `power_choke` without the queue term
 * fires at every peak by design (the cap is *meant* to bind) and
 * `queue_collapse` without the abandonment term fires whenever demand simply
 * exceeds capacity. Either alone would make criterion 3 trivially satisfiable.
 *
 * `margin_trap` is absent here on purpose: its definition needs the paired
 * same-seed baseline, so it is evaluated in `experiment/compareRuns.ts` and
 * appended to the manifest there.
 */

import {
  ALERT_RULES,
  ALERT_THRESHOLDS,
  FAILURE_ENTER_GRACE_SECONDS,
  FAILURE_RULES,
  FAILURE_THRESHOLDS,
} from "../core/calibration.ts";
import { bayList, dataOf, emit, round, type TickContext } from "../core/context.ts";
import {
  isDown,
  queuePressure,
  rollAbandonmentFraction,
  rollUptimeFraction,
  rollWindow,
  trustAtSecondsAgo,
} from "../core/selectors.ts";
import type { AlertName, FailureState, SimulationState } from "../core/types.ts";

export function detectFailureStates(ctx: TickContext): void {
  const { state } = ctx;
  const roll = rollWindow(state);
  const pressure = queuePressure(state);
  const uptimePct = rollUptimeFraction(roll) * 100;
  const allocatedPct =
    state.site.gridPowerKw > 0
      ? ((state.site.gridPowerKw - state.site.availablePowerKw) / state.site.gridPowerKw) * 100
      : 0;
  const baysDown = bayList(state).filter(isDown).length;
  const trust = state.site.metrics.trust;

  // D31: the abandonment arm reads the SUSTAIN window, not the 900 s card
  // window. Over 900 s the rate swings between 0% and 50% every time a session
  // starts, so a condition asked to hold for half an hour was being reset by
  // its own measurement noise. A sustained condition is measured over the span
  // it is meant to be sustained across.
  const sustainedAbandonmentPct =
    rollAbandonmentFraction(rollWindow(state, FAILURE_RULES.queue_collapse.sustainSeconds)) * 100;

  evaluate(ctx, "queue_collapse", {
    enter:
      pressure >= FAILURE_THRESHOLDS.queueCollapsePressure &&
      sustainedAbandonmentPct >= FAILURE_THRESHOLDS.queueCollapseAbandonmentPct,
    clear: pressure < FAILURE_THRESHOLDS.queueCollapseClearPressure,
    context: {
      queue_pressure: round(pressure, 2),
      abandonment_rate_pct: round(sustainedAbandonmentPct, 1),
    },
  });

  evaluate(ctx, "power_choke", {
    enter:
      allocatedPct >= FAILURE_THRESHOLDS.powerChokeAllocatedPct &&
      state.queue.length >= FAILURE_THRESHOLDS.powerChokeQueueLength,
    clear: allocatedPct < FAILURE_THRESHOLDS.powerChokeClearPct,
    context: { allocated_power_pct: round(allocatedPct, 1), queue_length: state.queue.length },
  });

  evaluate(ctx, "reliability_spiral", {
    // Either arm can raise it; the uptime arm needs the sustain window, the
    // bays-down arm is immediate (three bays down IS the spiral).
    enter:
      uptimePct < FAILURE_THRESHOLDS.reliabilitySpiralUptimePct ||
      baysDown >= FAILURE_THRESHOLDS.reliabilitySpiralBaysDown,
    immediate: baysDown >= FAILURE_THRESHOLDS.reliabilitySpiralBaysDown,
    clear:
      uptimePct >= FAILURE_THRESHOLDS.reliabilitySpiralClearUptimePct &&
      baysDown < FAILURE_THRESHOLDS.reliabilitySpiralBaysDown,
    context: { uptime_pct: round(uptimePct, 1), bays_down: baysDown },
  });

  evaluate(ctx, "trust_crash", {
    enter:
      trust < FAILURE_THRESHOLDS.trustCrashBelow &&
      trust < trustAtSecondsAgo(state, FAILURE_THRESHOLDS.trustCrashFallingOverSeconds),
    clear: trust >= FAILURE_THRESHOLDS.trustCrashClearAt,
    context: { trust: round(trust, 1) },
  });
}

interface Evaluation {
  enter: boolean;
  clear: boolean;
  /** Skip the sustain window for this tick (a condition severe on sight). */
  immediate?: boolean;
  context: Record<string, number>;
}

function evaluate(ctx: TickContext, name: FailureState, ev: Evaluation): void {
  const { state } = ctx;
  const now = state.clock.secondsElapsed;
  const rule = FAILURE_RULES[name];
  const active = state.site.metrics.failureStatesActive.includes(name);

  if (!active) {
    if (!ev.enter) {
      // A brief lapse does not restart the clock — see the grace constant.
      if (state.detectors.failureEnterSince[name] === undefined) return;
      const lapsedAt = state.detectors.failureLapseSince[name] ?? now;
      state.detectors.failureLapseSince[name] = lapsedAt;
      if (now - lapsedAt >= FAILURE_ENTER_GRACE_SECONDS) {
        delete state.detectors.failureEnterSince[name];
        delete state.detectors.failureLapseSince[name];
      }
      return;
    }
    delete state.detectors.failureLapseSince[name];
    const since = state.detectors.failureEnterSince[name] ?? now;
    state.detectors.failureEnterSince[name] = since;
    if (ev.immediate === true || now - since >= rule.sustainSeconds) {
      state.site.metrics.failureStatesActive.push(name);
      if (!state.site.metrics.failureStatesObserved.includes(name)) {
        state.site.metrics.failureStatesObserved.push(name);
      }
      delete state.detectors.failureClearSince[name];
      delete state.detectors.failureLapseSince[name];
      emit(ctx, "warn", "failure_state.entered", `Failure state: ${name}`, {
        entity_type: "site",
        entity_id: state.site.id,
        data: dataOf({ failure_state: name, ...ev.context }),
      });
    }
    return;
  }

  if (!ev.clear) {
    delete state.detectors.failureClearSince[name];
    return;
  }
  const clearSince = state.detectors.failureClearSince[name] ?? now;
  state.detectors.failureClearSince[name] = clearSince;
  if (now - clearSince >= rule.clearSeconds) {
    state.site.metrics.failureStatesActive = state.site.metrics.failureStatesActive.filter(
      (f) => f !== name,
    );
    delete state.detectors.failureEnterSince[name];
    delete state.detectors.failureLapseSince[name];
    delete state.detectors.failureClearSince[name];
    emit(ctx, "info", "failure_state.cleared", `Failure state cleared: ${name}`, {
      entity_type: "site",
      entity_id: state.site.id,
      data: dataOf({ failure_state: name, ...ev.context }),
    });
  }
}

/**
 * Alerts. Hysteresis (different raise and clear levels) is deliberate —
 * flapping alerts destroy the legibility the whole design depends on.
 */
export function detectAlerts(ctx: TickContext): void {
  const { state } = ctx;
  const roll = rollWindow(state);
  const pressure = queuePressure(state);
  const uptimePct = rollUptimeFraction(roll) * 100;
  const allocatedPct =
    state.site.gridPowerKw > 0
      ? ((state.site.gridPowerKw - state.site.availablePowerKw) / state.site.gridPowerKw) * 100
      : 0;

  alert(ctx, "queue_overload", {
    raise: pressure > ALERT_THRESHOLDS.queueOverloadPressure,
    clear: pressure < ALERT_THRESHOLDS.queueOverloadClearPressure,
    context: { queue_pressure: round(pressure, 2) },
  });
  alert(ctx, "low_uptime", {
    raise: uptimePct < ALERT_THRESHOLDS.lowUptimePct,
    clear: uptimePct >= ALERT_THRESHOLDS.lowUptimeClearPct,
    context: { uptime_pct: round(uptimePct, 1) },
  });
  alert(ctx, "negative_margin", {
    raise: roll.margin < ALERT_THRESHOLDS.negativeMarginAmount,
    clear: roll.margin >= ALERT_THRESHOLDS.negativeMarginClearAmount,
    context: { margin_roll_amount: round(roll.margin, 2) },
  });
  alert(ctx, "power_saturation", {
    raise: allocatedPct >= ALERT_THRESHOLDS.powerSaturationPct,
    clear: allocatedPct < ALERT_THRESHOLDS.powerSaturationClearPct,
    context: { allocated_power_pct: round(allocatedPct, 1) },
  });
  alert(ctx, "trust_collapse", {
    raise: state.site.metrics.trust < ALERT_THRESHOLDS.trustCollapseBelow,
    clear: state.site.metrics.trust >= ALERT_THRESHOLDS.trustCollapseClearAt,
    context: { trust: round(state.site.metrics.trust, 1) },
  });
}

function alert(
  ctx: TickContext,
  name: AlertName,
  ev: { raise: boolean; clear: boolean; context: Record<string, number> },
): void {
  const { state } = ctx;
  const now = state.clock.secondsElapsed;
  const active = state.site.metrics.activeAlerts.includes(name);
  const rule = ALERT_RULES[name];

  if (!active) {
    if (!ev.raise) {
      delete state.detectors.alertRaiseSince[name];
      return;
    }
    const since = state.detectors.alertRaiseSince[name] ?? now;
    state.detectors.alertRaiseSince[name] = since;
    if (now - since >= rule.sustainSeconds) {
      state.site.metrics.activeAlerts.push(name);
      emit(ctx, "warn", "alert.raised", `Alert: ${name}`, {
        entity_type: "site",
        entity_id: state.site.id,
        data: dataOf({ alert_name: name, ...ev.context }),
      });
    }
    return;
  }

  if (ev.clear) {
    state.site.metrics.activeAlerts = state.site.metrics.activeAlerts.filter((a) => a !== name);
    delete state.detectors.alertRaiseSince[name];
    emit(ctx, "info", "alert.cleared", `Alert cleared: ${name}`, {
      entity_type: "site",
      entity_id: state.site.id,
      data: dataOf({ alert_name: name, ...ev.context }),
    });
  }
}

export function observedFailureStates(state: SimulationState): FailureState[] {
  return [...state.site.metrics.failureStatesObserved];
}
