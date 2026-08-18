/**
 * The real-time driver's debt arithmetic — D26's "ticks per real second, never
 * a variable tick size", and the stall behaviour that goes with it.
 *
 * These exist because the loop shipped with a per-frame cap that read like a
 * catch-up limit and was not one. The backlog survived, so a backgrounded tab
 * replayed every missed tick twelve at a time: measured at 4×, one minute away
 * accrued 1,152 ticks — 80% of a day — and spent them over 134 frames the board
 * could not paint through. The comment above the constant claimed the opposite,
 * which is why nothing caught it.
 */

import { describe, expect, it } from "vitest";
import { spendDebt } from "../src/ui/hooks/useGameLoop.ts";

const FRAME = 1 / 60;
/** Architecture §2.2: 288× compression, so 1,440 ticks fill 300 real seconds. */
const TICKS_PER_REAL_SECOND = 4.8;

describe("the loop spends real time at the rate D26 fixes", () => {
  it("runs a whole second's worth of ticks in a second, at each speed", () => {
    for (const speed of [1, 2, 4]) {
      let debt = 0;
      let ticks = 0;
      for (let f = 0; f < 60; f++) {
        const { budget, carried } = spendDebt(debt, FRAME, speed);
        ticks += budget;
        debt = carried;
      }
      // Whole ticks only, so the remainder is carried rather than lost.
      expect(ticks).toBe(Math.floor(TICKS_PER_REAL_SECOND * speed));
    }
  });

  it("carries the fractional remainder instead of dropping it", () => {
    // At 1× a frame is worth 0.08 ticks, so most frames run none at all and the
    // sim would stand still if the remainder were discarded.
    const { budget, carried } = spendDebt(0, FRAME, 1);
    expect(budget).toBe(0);
    expect(carried).toBeGreaterThan(0);
  });
});

describe("a stall is dropped, not replayed", () => {
  it("caps what one minute away can cost, at every speed", () => {
    for (const speed of [1, 2, 4]) {
      const { budget, carried } = spendDebt(0, 60, speed);
      // Unclamped this was 60 × 4.8 × speed — 1,152 ticks at 4×.
      expect(budget).toBeLessThanOrEqual(12);
      expect(carried).toBe(0);
    }
  });

  it("does not let a stall accumulate across frames", () => {
    // The shape of the original bug: a huge gap, then ordinary frames. Every
    // one of those frames used to run a full twelve until the backlog cleared.
    let debt = spendDebt(0, 60, 4).carried;
    let ticks = 0;
    for (let f = 0; f < 30; f++) {
      const { budget, carried } = spendDebt(debt, FRAME, 4);
      ticks += budget;
      debt = carried;
    }
    // Half a second at 4× is ~9 ticks. Under the old behaviour: 30 × 12 = 360.
    expect(ticks).toBeLessThanOrEqual(12);
  });

  it("still catches up across a brief hitch", () => {
    // Dropping a stall must not mean dropping a dropped frame. Ten frames' gap
    // is 3.2 ticks at 4× — inside the backlog, so all three whole ones are run
    // on the spot rather than trickled out one per frame.
    const gap = FRAME * 10;
    const { budget, carried } = spendDebt(0, gap, 4);
    expect(budget).toBe(Math.floor(gap * TICKS_PER_REAL_SECOND * 4));
    expect(budget).toBeGreaterThan(0);
    expect(carried).toBeCloseTo(gap * TICKS_PER_REAL_SECOND * 4 - budget, 6);
  });
});
