/**
 * The only source of randomness in the sim (D26, amended by D65).
 *
 * **Keyed draws (D65).** Every random draw comes from its own short mulberry32
 * stream, seeded from the run's seed plus a key naming what the draw is for:
 * `arrivals` and the minute; `fault`, the bay and the minute; `perceive` or
 * `abandon` and the car. Nothing is drawn "next" from a shared stream, so a
 * player's action can no longer shift every later draw: a seed is a fixed day.
 * The same cars come (fewer of them when the price is higher), and a bay that
 * is charging at 14:05 gets the same luck at 14:05 whatever happened before.
 *
 * D26's rule was "never create a per-system stream: they reorder under
 * refactoring and break replay silently". That was about streams drawn in
 * order. A keyed draw has no order to break — moving code around cannot change
 * which numbers it gets — which is the stronger form of the same guarantee.
 *
 * `Math.random()`, `Date.now()` and `new Date()` are banned in `game/`.
 */

/** FNV-1a 32-bit over a string. Used for seed hashing and state hashing. */
export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // hash *= 16777619, in 32-bit space
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function seedToUint32(seed: string): number {
  // A zero state is legal for mulberry32 but a degenerate-looking one; nudge it.
  const h = fnv1a32(seed);
  return h === 0 ? 0x9e3779b9 : h;
}

export function toRngState(value: number): string {
  return (value >>> 0).toString(16).padStart(8, "0");
}

export function fromRngState(hex: string): number {
  return parseInt(hex, 16) >>> 0;
}

/**
 * Stateful handle over the single stream. Constructed from `state.rngState`
 * at the top of a tick and written back at the end, so the PRNG position is
 * part of serialised state.
 */
export class Rng {
  private s: number;

  constructor(state: string | number) {
    this.s = typeof state === "string" ? fromRngState(state) : state >>> 0;
  }

  static fromSeed(seed: string): Rng {
    return new Rng(seedToUint32(seed));
  }

  get state(): string {
    return toRngState(this.s);
  }

  /** mulberry32 — uniform in [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Uniform integer in [min, max]. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  bool(p: number): boolean {
    return this.next() < p;
  }

  /** Knuth's method. Fine for the small means (λ ≤ ~0.6) the wave table uses. */
  poisson(lambda: number): number {
    if (lambda <= 0) return 0;
    const limit = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k += 1;
      p *= this.next();
    } while (p > limit);
    return k - 1;
  }

  /** Weighted pick over [item, weight] pairs. Weights need not sum to 1. */
  pick<T>(weighted: readonly (readonly [T, number])[]): T {
    let total = 0;
    for (const [, w] of weighted) total += w;
    let r = this.next() * total;
    for (const [item, w] of weighted) {
      r -= w;
      if (r <= 0) return item;
    }
    // Floating-point fallthrough: return the last item.
    const last = weighted[weighted.length - 1];
    if (!last) throw new Error("Rng.pick called with an empty list");
    return last[0];
  }
}

/**
 * A stream for one purpose (D65). `seedKey` is `state.rngSeed`; `parts` name
 * the draw, e.g. `drawFor(seed, "fault", "bay-3", 845)`. Same key, same numbers.
 */
export function drawFor(seedKey: string, ...parts: (string | number)[]): Rng {
  return new Rng(seedToUint32(`${seedKey}|${parts.join("|")}`));
}

/**
 * How much wear a bay takes before its next random fault (D65): an
 * exponential draw with mean 1, keyed by the bay and how many random faults it
 * has had. Summing a per-minute hazard against it faults at the same average
 * rate as testing that hazard each minute.
 */
export function wearLimitFor(seedKey: string, bayId: string, faultIndex: number): number {
  return -Math.log(1 - drawFor(seedKey, "wear", bayId, faultIndex).next());
}

/**
 * A Poisson count from one uniform number, by inverting the cumulative
 * distribution (D65). The count rises with `lambda` for a fixed `u`, which is
 * what makes a price change thin out the same arrivals rather than draw new ones.
 */
export function poissonFromUniform(lambda: number, u: number): number {
  if (lambda <= 0) return 0;
  let k = 0;
  let p = Math.exp(-lambda);
  let cumulative = p;
  while (u >= cumulative && k < 1_000) {
    k += 1;
    p *= lambda / k;
    cumulative += p;
  }
  return k;
}

/**
 * Canonical JSON: object keys sorted, so the hash is insensitive to key
 * insertion order. Numbers are emitted by JSON.stringify's own rules, which are
 * deterministic for IEEE-754 doubles.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts: string[] = [];
  for (const k of keys) {
    if (obj[k] === undefined) continue; // JSON.stringify drops these too
    parts.push(`${JSON.stringify(k)}:${canonicalJson(obj[k])}`);
  }
  return `{${parts.join(",")}}`;
}

/**
 * FNV-1a over canonical JSON with `eventLog` excluded — it is a ring buffer,
 * not state (D26).
 */
export function hashState(state: unknown): string {
  const { eventLog: _eventLog, ...rest } = state as Record<string, unknown>;
  return toRngState(fnv1a32(canonicalJson(rest)));
}
