/**
 * The real-time driver — Architecture §2.2 step 3.
 *
 * D26 is binding here: the speed control changes **how many ticks run per real
 * second** and never the tick size. So this loop accumulates real elapsed time
 * and spends it in whole ticks; it never passes a delta to the sim.
 *
 * At 288× compression a 24-hour day is 300 real seconds: 1,440 ticks of 60
 * sim-seconds each, i.e. 4.8 ticks per real second at 1× speed.
 */

import { useEffect, useRef } from "react";

const TICKS_PER_REAL_SECOND = 4.8;
/** Cap the catch-up after a stall, so a backgrounded tab doesn't fast-forward. */
const MAX_TICKS_PER_FRAME = 12;

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
        debt.current += elapsedSeconds * TICKS_PER_REAL_SECOND * speed;
        let budget = Math.min(Math.floor(debt.current), MAX_TICKS_PER_FRAME);
        debt.current -= budget;
        while (budget-- > 0) advance();
      }
      last.current = now;
      frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [running, speed, advance]);
}
