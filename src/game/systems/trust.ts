/**
 * Trust — persistent state, not a derived KPI (C7).
 *
 * The ±5 clamp is a ROLLING 3,600 sim-second window, not an hour bucket:
 * bucket boundaries would let a 10-point swing through by straddling 59:59.
 * Clamping is silent by design, so clamp hits are counted — if the counter
 * climbs, the underlying deltas are wrong and Phase 3 needs to know.
 */

import { TRUST, TRUST_WINDOW_SECONDS } from "../core/calibration.ts";
import type { TickContext } from "../core/context.ts";
import { rollUptimeFraction, rollWindow, trustWindowSum } from "../core/selectors.ts";

export function updateTrust(ctx: TickContext): void {
  const { state } = ctx;

  // Standing bonus for sustained high uptime, prorated to the tick.
  //
  // The `?? 1` preserves today's behaviour exactly: a window with no open bay
  // reads 100% and earns the bonus. That is arguably wrong — a site with every
  // bay closed is not a reliable one — but changing it changes sim behaviour and
  // every downstream hash, so it is left as a separate decision rather than
  // smuggled in with a display fix.
  const roll = rollWindow(state);
  if (roll.samples > 0 && (rollUptimeFraction(roll) ?? 1) * 100 > TRUST.uptimeBonusThresholdPct) {
    ctx.trustDeltaRaw += TRUST.uptimeBonusPerSimHour * (ctx.delta / 3_600);
  }

  const windowSum = trustWindowSum(state, TRUST_WINDOW_SECONDS);
  const lower = -TRUST.clampPerWindow - windowSum;
  const upper = TRUST.clampPerWindow - windowSum;
  const applied = Math.min(upper, Math.max(lower, ctx.trustDeltaRaw));

  if (Math.abs(applied - ctx.trustDeltaRaw) > 1e-9) {
    state.site.metrics.trustClampHits += 1;
  }

  const before = state.site.metrics.trust;
  state.site.metrics.trust = Math.min(
    TRUST.max,
    Math.max(TRUST.min, state.site.metrics.trust + applied),
  );
  // What actually landed after the 0–100 clamp is what the window records.
  ctx.sample.trustDelta = state.site.metrics.trust - before;
  state.site.metrics.trustDeltaThisHour = windowSum + ctx.sample.trustDelta;
}
