/**
 * Invariant 9 and the determinism contract — D4/D26.
 *
 * "Same seed ⇒ same hash" is the claim the entire replay/experiment layer rests
 * on, so it is tested at three levels: the PRNG, a single run, and a run with a
 * player action stream folded in.
 */

import { describe, expect, it } from "vitest";
import { canonicalJson, fnv1a32, hashState, Rng, seedToUint32 } from "../src/game/core/rng.ts";
import { createInitialState } from "../src/game/core/init.ts";
import { runScenario } from "../src/game/core/run.ts";
import { tick } from "../src/game/core/tick.ts";
import { baselinePolicy } from "../src/game/experiment/baselinePolicy.ts";
import { roadsideHub } from "../src/game/scenarios/roadsideHub.ts";
import type { PlayerActionDraft } from "../src/game/core/types.ts";

describe("PRNG", () => {
  it("is reproducible from a string seed", () => {
    const a = Rng.fromSeed("pt-1");
    const b = Rng.fromSeed("pt-1");
    const drawsA = Array.from({ length: 100 }, () => a.next());
    const drawsB = Array.from({ length: 100 }, () => b.next());
    expect(drawsA).toEqual(drawsB);
  });

  it("accepts numeric-looking seeds as strings and differs between seeds", () => {
    const a = Array.from({ length: 20 }, (_, i) => Rng.fromSeed(`${i}`).next());
    expect(new Set(a).size).toBe(20);
  });

  it("round-trips its state through 8 hex chars", () => {
    const rng = Rng.fromSeed("s1");
    for (let i = 0; i < 7; i++) rng.next();
    const resumed = new Rng(rng.state);
    expect(rng.state).toMatch(/^[0-9a-f]{8}$/);
    expect(resumed.next()).toBe(new Rng(rng.state).next());
  });

  it("produces a uniform-ish stream", () => {
    const rng = Rng.fromSeed("uniformity");
    const buckets = new Array(10).fill(0) as number[];
    for (let i = 0; i < 100_000; i++) {
      const b = Math.floor(rng.next() * 10);
      buckets[b] = (buckets[b] ?? 0) + 1;
    }
    for (const count of buckets) {
      expect(count).toBeGreaterThan(9_000);
      expect(count).toBeLessThan(11_000);
    }
  });

  it("hashes seeds with FNV-1a and never lands on a zero state", () => {
    expect(fnv1a32("")).toBe(0x811c9dc5);
    expect(seedToUint32("pt-1")).toBeGreaterThan(0);
  });
});

describe("canonical JSON", () => {
  it("is insensitive to key insertion order", () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 4, c: 3 }] })).toBe(
      canonicalJson({ a: [2, { c: 3, d: 4 }], b: 1 }),
    );
  });

  it("excludes the event ring from the state hash", () => {
    const state = createInitialState(roadsideHub, "s1");
    const withEvents = {
      ...state,
      eventLog: [{ atSecond: 0, tick: 0, level: "info" as const, name: "x", message: "y" }],
    };
    expect(hashState(withEvents)).toBe(hashState(state));
  });
});

describe("run determinism (invariant 9)", () => {
  it("same seed ⇒ same final state hash", () => {
    const a = runScenario({ scenario: roadsideHub, seed: "s1", policy: baselinePolicy, collectLog: false });
    const b = runScenario({ scenario: roadsideHub, seed: "s1", policy: baselinePolicy, collectLog: false });
    expect(a.finalStateHash).toBe(b.finalStateHash);
    expect(a.initialStateHash).toBe(b.initialStateHash);
  });

  it("different seeds ⇒ different final state hashes", () => {
    const a = runScenario({ scenario: roadsideHub, seed: "s1", policy: baselinePolicy, collectLog: false });
    const b = runScenario({ scenario: roadsideHub, seed: "s2", policy: baselinePolicy, collectLog: false });
    expect(a.finalStateHash).not.toBe(b.finalStateHash);
  });

  it("same seed + same action stream ⇒ same hash", () => {
    const actions = new Map<number, PlayerActionDraft[]>([
      [120, [{ type: "set_price", pricePerKwh: 0.95 }]],
      [300, [{ type: "set_power_policy", powerPolicy: "queue_relief" }]],
      [420, [{ type: "set_partial_charge_target", targetSoc: 0.8 }]],
      [700, [{ type: "set_maintenance_level", level: "preventive" }]],
      [800, [{ type: "toggle_bay_group", bayIds: ["bay-1"], open: false }]],
      [900, [{ type: "upgrade_charger", chargerBayId: "bay-2", newType: "ultrarapid_dc" }]],
    ]);
    const a = runScenario({
      scenario: roadsideHub,
      seed: "pt-1",
      policy: baselinePolicy,
      scriptedActions: actions,
      collectLog: false,
    });
    const b = runScenario({
      scenario: roadsideHub,
      seed: "pt-1",
      policy: baselinePolicy,
      scriptedActions: actions,
      collectLog: false,
    });
    expect(a.finalStateHash).toBe(b.finalStateHash);
    // …and the action stream actually changed the run.
    const plain = runScenario({
      scenario: roadsideHub,
      seed: "pt-1",
      policy: baselinePolicy,
      collectLog: false,
    });
    expect(a.finalStateHash).not.toBe(plain.finalStateHash);
  });

  it("rngState matches tick-for-tick between two runs of the same seed", () => {
    let a = createInitialState(roadsideHub, "s3");
    let b = createInitialState(roadsideHub, "s3");
    for (let i = 0; i < 200; i++) {
      a = tick(a).state;
      b = tick(b).state;
      // Localises any divergence to a tick rather than "somewhere in 1,440".
      expect(`${i}:${a.rngState}`).toBe(`${i}:${b.rngState}`);
    }
  });

  it("uses a fixed timestep regardless of how ticks are driven", () => {
    let state = createInitialState(roadsideHub, "s1");
    for (let i = 0; i < 10; i++) {
      state = tick(state).state;
      expect(state.clock.deltaSeconds).toBe(roadsideHub.tickSeconds);
    }
    expect(state.clock.secondsElapsed).toBe(10 * roadsideHub.tickSeconds);
  });

  it("tick() does not mutate the state it was given", () => {
    const before = createInitialState(roadsideHub, "s1");
    const snapshot = hashState(before);
    tick(before);
    expect(hashState(before)).toBe(snapshot);
  });
});
