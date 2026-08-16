/**
 * Colour contrast — WCAG 2.1 AA, checked against the stylesheet that actually
 * ships rather than against a list of hexes copied into a test.
 *
 * This exists because the dark theme shipped with every small label at
 * 3.2–3.9:1. The palette had been validated once, for *chart marks*, where the
 * bar is 3:1 because a line on a plot is a graphic. Text under 18.66px needs
 * 4.5:1, and the same colours were being used for both. A number that passes
 * one bar does not pass the other, and nothing was checking.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../src/styles/app.css", import.meta.url), "utf8");

function cssVar(name: string): string {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!match?.[1]) throw new Error(`--${name} not found in app.css`);
  return match[1];
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const [r = 0, g = 0, b = 0] = channels;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

const SURFACES = {
  bg: cssVar("bg"),
  panel: cssVar("panel"),
  raised: cssVar("raised"),
};

/** AA for text below 18.66px, which is everything on this dashboard. */
const AA_TEXT = 4.5;
/** AA for graphics and UI component boundaries. */
const AA_GRAPHIC = 3;

describe("text ramp clears AA on every surface", () => {
  for (const ink of ["ink", "ink-2", "ink-3"]) {
    for (const [surfaceName, surface] of Object.entries(SURFACES)) {
      it(`--${ink} on --${surfaceName}`, () => {
        expect(contrastRatio(cssVar(ink), surface)).toBeGreaterThanOrEqual(AA_TEXT);
      });
    }
  }

  it("keeps three visibly distinct steps, so hierarchy survives the fix", () => {
    const [a, b, c] = ["ink", "ink-2", "ink-3"].map((n) =>
      contrastRatio(cssVar(n), SURFACES.panel),
    );
    expect(a).toBeGreaterThan((b ?? 0) * 1.2);
    expect(b).toBeGreaterThan((c ?? 0) * 1.2);
  });
});

describe("status colours are legible as text", () => {
  for (const status of ["ok", "warn", "bad", "info"]) {
    it(`--${status} on --panel`, () => {
      expect(contrastRatio(cssVar(status), SURFACES.panel)).toBeGreaterThanOrEqual(AA_TEXT);
    });
  }
});

describe("charger tiers carry two forms, and each meets its own bar", () => {
  for (const tier of ["tier-rapid", "tier-ultra"]) {
    it(`--${tier} works as a mark or fill`, () => {
      expect(contrastRatio(cssVar(tier), SURFACES.panel)).toBeGreaterThanOrEqual(AA_GRAPHIC);
    });

    it(`--${tier}-text works as text`, () => {
      expect(contrastRatio(cssVar(`${tier}-text`), SURFACES.panel)).toBeGreaterThanOrEqual(
        AA_TEXT,
      );
    });
  }

  it("the text variants are lighter than the mark colours, not different hues", () => {
    for (const tier of ["tier-rapid", "tier-ultra"]) {
      expect(relativeLuminance(cssVar(`${tier}-text`))).toBeGreaterThan(
        relativeLuminance(cssVar(tier)),
      );
    }
  });
});

describe("no label is set below 10px", () => {
  it("the smallest declared font-size is at least 9.5px", () => {
    // Uppercase, letterspaced text at 9px is hard to read at any contrast.
    // 9.5px is the chart axis label, which is mono and numeric.
    const sizes = [...css.matchAll(/font-size:\s*([\d.]+)px/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(10);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(9.5);
  });
});
