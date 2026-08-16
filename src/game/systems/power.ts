/**
 * Power allocation — Architecture §6.1 (D23).
 *
 * The pool is `site.gridPowerKw`; each bay's ceiling is
 * `min(spec.maxPowerKw, vehicle.maxChargeRateKw) × taper(soc)`. A bay is never
 * allocated power its vehicle cannot accept (invariant 2).
 *
 * Under a binding cap none of these policies creates kilowatts — they choose
 * who waits. That is the intended lesson, and it is why partial-charge (D14) is
 * the only ceiling-raising lever.
 */

import { bayList, type TickContext } from "../core/context.ts";
import { bayCeilingKw, estimatedRemainingSeconds } from "../core/selectors.ts";
import type { ChargerBay, SimulationState } from "../core/types.ts";

interface Candidate {
  bay: ChargerBay;
  ceiling: number;
}

export function rebalancePower(ctx: TickContext): void {
  const { state } = ctx;
  const pool = state.site.gridPowerKw;

  for (const bay of bayList(state)) {
    if (!bay.activeSessionId) bay.allocatedPowerKw = 0;
  }

  const candidates: Candidate[] = bayList(state)
    .filter((b) => b.activeSessionId !== undefined && (b.state === "charging" || b.state === "allocated"))
    .map((bay) => ({ bay, ceiling: bayCeilingKw(state, bay) }));

  for (const c of candidates) c.bay.allocatedPowerKw = 0;

  switch (state.site.policy.powerPolicy) {
    case "equal_share":
      allocateEqualShare(candidates, pool);
      break;
    case "fast_first":
      allocateGreedy(
        [...candidates].sort(
          (a, b) => b.bay.spec.maxPowerKw - a.bay.spec.maxPowerKw || cmpId(a.bay, b.bay),
        ),
        pool,
      );
      break;
    case "queue_relief":
      // Shortest-job-first: finish sessions soonest, so bays return to the
      // queue fastest. Genuinely distinct from fast_first — a nearly-done car
      // on a slow bay outranks a just-plugged car on an ultra.
      allocateGreedy(
        [...candidates].sort(
          (a, b) =>
            estimatedRemainingSeconds(state, a.bay) - estimatedRemainingSeconds(state, b.bay) ||
            cmpId(a.bay, b.bay),
        ),
        pool,
      );
      break;
    case "manual":
      allocateManual(state, candidates, pool);
      break;
  }

  let allocated = 0;
  for (const { bay } of candidates) {
    // A bay holding a vehicle but drawing nothing is plugged in, not charging.
    bay.state = bay.allocatedPowerKw > 0 ? "charging" : "allocated";
    allocated += bay.allocatedPowerKw;
  }
  state.site.availablePowerKw = pool - allocated;
  ctx.sample.allocatedPowerKw = allocated;
}

/** Equal split, clamped per bay, with the clamped surplus redistributed. */
function allocateEqualShare(candidates: Candidate[], pool: number): void {
  let remaining = pool;
  let open = candidates.filter((c) => c.ceiling > 0);
  const settled = new Set<string>();

  while (open.length > 0 && remaining > 1e-9) {
    const share = remaining / open.length;
    const clamped = open.filter((c) => c.ceiling <= share);
    if (clamped.length === 0) {
      for (const c of open) c.bay.allocatedPowerKw = share;
      remaining = 0;
      break;
    }
    for (const c of clamped) {
      c.bay.allocatedPowerKw = c.ceiling;
      remaining -= c.ceiling;
      settled.add(c.bay.id);
    }
    open = open.filter((c) => !settled.has(c.bay.id));
  }
}

/** Each bay in order takes its full ceiling; the marginal bay takes the rest. */
function allocateGreedy(ordered: Candidate[], pool: number): void {
  let remaining = pool;
  for (const c of ordered) {
    if (remaining <= 1e-9) {
      c.bay.allocatedPowerKw = 0;
      continue;
    }
    const take = Math.min(c.ceiling, remaining);
    c.bay.allocatedPowerKw = take;
    remaining -= take;
  }
}

/**
 * Player-set per-bay kW, clamped to each ceiling. If the request exceeds the
 * pool it is scaled down proportionally — the reducer never exceeds the cap to
 * honour a player request.
 */
function allocateManual(state: SimulationState, candidates: Candidate[], pool: number): void {
  const requests = state.site.policy.manualAllocationsKw ?? {};
  let total = 0;
  const wanted = candidates.map((c) => {
    const want = Math.max(0, Math.min(c.ceiling, requests[c.bay.id] ?? 0));
    total += want;
    return { c, want };
  });
  const scale = total > pool && total > 0 ? pool / total : 1;
  for (const { c, want } of wanted) {
    c.bay.allocatedPowerKw = want * scale;
  }
}

function cmpId(a: ChargerBay, b: ChargerBay): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
