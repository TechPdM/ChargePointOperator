/**
 * The real-time driver — Architecture §2.2 step 3.
 *
 * D26 is binding here: the speed control changes **how many ticks run per real
 * second** and never the tick size. So this loop accumulates real elapsed time
 * and spends it in whole ticks; it never passes a delta to the sim.
 *
 * At 288× compression a 24-hour day is 300 real seconds: 1,440 ticks of 60
 * sim-seconds each, i.e. 4.8 ticks per real second at 1× speed.
 *
 * **No `visibilitychange` or blur handler, deliberately (D40).** Losing focus
 * leaves the tab visible, so rAF keeps firing and the day carries on — that is
 * the intended behaviour and nothing here should interfere with it. Hiding the
 * tab stops rAF at the browser's discretion, which already pauses the day
 * without being asked to; the debt clamp below is what stops it replaying the
 * missed time on return. Making that implicit pause visible was considered and
 * declined. Whether a hidden tab should keep *trading* is a separate question
 * D40 leaves open, and answering it means moving off rAF rather than adding a
 * handler here.
 */

import { useEffect, useRef } from "react";

const TICKS_PER_REAL_SECOND = 4.8;
/** Most ticks one frame will run. Keeps a single frame's work bounded. */
const MAX_TICKS_PER_FRAME = 12;
/**
 * Most ticks the loop will ever owe. This is what actually stops a stall from
 * fast-forwarding, and capping the per-frame spend alone did not: the backlog
 * survived and drained twelve at a time across however many frames it took.
 *
 * Measured before this existed — one minute backgrounded at 4× accrued 1,152
 * ticks of debt, 80% of a whole day, and spent them over 134 frames during
 * which the board could not paint. The clock jumped 00:17 → 20:13. From the
 * player's side that is a freeze, and then a day they never played.
 *
 * So time spent away is dropped rather than replayed. A brief hitch still
 * catches up smoothly, because one frame's worth of debt is still allowed.
 */
const MAX_TICK_BACKLOG = MAX_TICKS_PER_FRAME;

/**
 * How many ticks this frame runs, and how much debt survives it.
 *
 * Pulled out of the loop so it can be tested without a renderer. The bug this
 * fixes lived here and was invisible for weeks: the per-frame cap looked like a
 * catch-up limit, and the missing clamp on the carried debt is the difference
 * between dropping a stall and replaying it.
 */
export function spendDebt(
  debt: number,
  elapsedSeconds: number,
  speed: number,
): { budget: number; carried: number } {
  const owed = Math.min(debt + elapsedSeconds * TICKS_PER_REAL_SECOND * speed, MAX_TICK_BACKLOG);
  const budget = Math.min(Math.floor(owed), MAX_TICKS_PER_FRAME);
  return { budget, carried: owed - budget };
}

export function useGameLoop(running: boolean, speed: number, advance: () => void): void {
  const debt = useRef(0);
  const last = useRef<number | null>(null);

  useEffect(() => {
    if (!running) {
      last.current = null;
      debt.current = 0;
      return;
    }

    let frame = 0;
    const step = (now: number): void => {
      if (last.current !== null) {
        const elapsedSeconds = (now - last.current) / 1_000;
        const { budget, carried } = spendDebt(debt.current, elapsedSeconds, speed);
        debt.current = carried;
        for (let i = 0; i < budget; i++) advance();
      }
      last.current = now;
      frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [running, speed, advance]);
}
