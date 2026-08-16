/**
 * The only source of randomness in the sim (D26).
 *
 * One global mulberry32 stream, drawn in pipeline order. Never create a
 * per-system stream: they reorder under refactoring and break replay silently.
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
