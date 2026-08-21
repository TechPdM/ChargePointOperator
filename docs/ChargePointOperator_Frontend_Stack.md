# ChargePointOperator — front-end stack

Canonical for: **what the dashboard is built out of, and what it deliberately is not.**

The simulation core (`src/game/`) is headless and has no front-end dependencies — it runs under `tsx` in the CLI and under Vitest in the tests without a browser anywhere. Everything described here sits on top of it: `src/main.tsx`, `src/app/`, `src/ui/` and `src/styles/`.

## 1. The stack

| Piece | Version | What it does here |
| :-- | :-- | :-- |
| React | ^19.2.8 | The only runtime dependency, with `react-dom`. Function components, hooks, `StrictMode`. |
| react-dom | ^19.2.8 | `createRoot` in `src/main.tsx`. |
| TypeScript | ^5.7.2 | Strict, `noEmit`. Type checking is a separate step from the build. |
| Vite | ^6.0.5 | Dev server, HMR, production bundle, worker bundling. |
| @vitejs/plugin-react | ^4.7.0 | The React refresh + JSX transform plugin. Nothing else is configured. |
| Vitest | ^2.1.8 | Tests, in a `node` environment — see §10. |

That is the whole list. There are **two** runtime dependencies in `package.json`; everything else is a dev dependency.

### Deliberate absences

| Not used | Instead | Why |
| :-- | :-- | :-- |
| State library (Zustand, Redux) | `useReducer` in one hook | D28, resolving D17 |
| Chart library (Recharts, D3) | Hand-rolled SVG in `src/ui/components/chart.tsx` | D28 |
| CSS framework / utility CSS / preprocessor | One hand-written `src/styles/app.css` | §7 |
| Component library | `Panel` / `Empty` in `src/ui/components/Panel.tsx` | §6 |
| Router | Single screen | The dashboard *is* the site (D3/C2) |
| jsdom, Testing Library | Type checking + the browser | §10 |

D28 (2026-08-16, Phase 2 start) is the decision that closed this: *"Store: `useReducer` + context. Charts: hand-rolled SVG, no chart library."* In practice the context half was never needed — see §4.

## 2. Entry point and build

```
index.html  →  /src/main.tsx  →  <App />  (src/app/App.tsx)
```

`index.html` at the repo root is the Vite entry: one `<div id="root">` and a module script. `src/main.tsx` mounts the root in `StrictMode` and imports `src/styles/app.css` — the single stylesheet import for the whole app.

Scripts (`package.json`):

```bash
npm run dev
```

Vite dev server on port **5273**, overridable with `PORT` so a second session can run its own server (`vite.config.ts`).

```bash
npm run build
```

`tsc --noEmit && vite build` — type checking gates the bundle. `npm run typecheck` runs the same check alone.

## 3. TypeScript configuration

`tsconfig.json` covers `src`, `tests` and `vitest.config.ts` with one config for both the headless core and the UI. The settings that shape day-to-day front-end code:

- **`"jsx": "react-jsx"`** — no `import React` needed; components import only the hooks and types they use.
- **`"allowImportingTsExtensions": true`** — this is why every local import in this codebase carries its extension: `from "../ui/hooks/useSimulation.ts"`, `from "./Panel.tsx"`. Match it; a bare specifier is inconsistent with every other file.
- **`"verbatimModuleSyntax": true`** — type-only imports must be written `import type { ... }`.
- **`"strict"`, `"noUncheckedIndexedAccess"`, `"noUnusedLocals"`, `"noUnusedParameters"`** — indexing an array yields `T | undefined`, and an unused import fails the build rather than lingering.
- **`"types": ["node"]`, `"lib": ["ES2022", "DOM"]`** — DOM, not WebWorker. The worker file narrows `self` by hand because of this (§5).
- **`"moduleResolution": "bundler"`, `"isolatedModules": true`** — Vite/esbuild semantics.

## 4. State: one reducer, props down

`src/ui/hooks/useSimulation.ts` is the store. It holds the entire `SimulationState` in a `useReducer`, and `src/app/App.tsx` calls it once and passes the returned `sim` object down as a prop to whichever panels need to read or dispatch.

Despite D28's wording there is **no React context in the app** — `createContext` appears nowhere in `src/`. The tree is shallow enough that prop drilling one object was cheaper than a provider, and that is the shape to keep unless the tree deepens.

The rules the store follows:

- **No business logic in the hook.** The UI dispatches player actions (`src/game/actions/playerActions.ts`), asks for ticks (`src/game/core/tick.ts`), and reads everything back through selectors (`src/game/core/selectors.ts`). The sim core does not know the hook exists.
- **State is replaced every tick.** `state` is a new object on every one of the 1,440 ticks in a day, which is why memoised children take scalar props rather than `state` (§6). What that replacement costs is measured in §9.1.
- **Run identity.** `startedAtUtc` keys the pricing panel so a restart resets its local draft; a monotonic `runSeq` is what a late worker reply is checked against.

## 5. Real time and the worker

Two pieces of front-end machinery exist only because this is a real-time game in a browser tab.

**`src/ui/hooks/useGameLoop.ts`** turns real time into ticks over `requestAnimationFrame`. D26 is binding: the speed control changes *how many ticks run per real second*, never the tick size, so the loop accumulates elapsed real time and spends it in whole ticks — it never passes a delta to the sim. At 288× compression a 24-hour day is 300 real seconds, i.e. 4.8 ticks per real second at 1×.

The debt arithmetic is extracted as a pure `spendDebt(debt, elapsedSeconds, speed)` so it can be tested without a renderer (`tests/gameLoop.test.ts`); the clamp on carried debt is what stops a backgrounded tab from fast-forwarding the day on return. There is no `visibilitychange` or blur handler, deliberately (D40). The per-frame tick cap is the front end's main jank risk — see §9.2.

**`src/ui/workers/baseline.worker.ts`** runs the end-of-day baseline comparison — a full 1,440-tick simulation, ~1.8s — off the main thread, so the final board paints immediately. It is instantiated the Vite-native way:

```ts
new Worker(new URL("../workers/baseline.worker.ts", import.meta.url), { type: "module" })
```

Only plain data crosses the boundary (the scenario goes over as an id and is looked up on the worker side). If construction or the worker itself fails, `useSimulation` falls back to scoring on the main thread. The worker is terminated on unmount.

## 6. Components

24 files under `src/ui/components/`, plus `src/ui/format.ts` and the two hooks. Conventions visible throughout:

- **One frame component.** `Panel` (title, optional hint, optional tone, `wide`) wraps almost every box on screen; `Empty` is the shared empty state. Twelve of the components import it.
- **Props are explicit and inline.** Components take a destructured object literal type and return `ReactElement`; there are no exported `Props` interfaces.
- **Formatting is centralised.** `src/ui/format.ts` owns the one typographic rule — every number carries its unit, the unit set smaller and dimmer, numerals tabular — plus `simClock`, `money`, `minutes`, `pct` and the archetype labels.
- **`memo` where it pays, and only there.** `WaitTimeTrendChart`, `EconomicsTrendChart` and `EventLogPanel` are memoised, and they take the scalars they read (`durationSeconds`, `maxAvgWaitSeconds`, `snapshots`) rather than `state`, whose identity changes every tick.
- **`fieldset disabled`** is the native mechanism for the post-run screen: one attribute disables a whole group of controls including keyboard focus, while leaving the numbers readable. `App.tsx` uses three.

## 7. Styling

One stylesheet: `src/styles/app.css`, roughly 1,530 lines, hand-written, no preprocessor and no build step beyond Vite's.

- **Custom properties as the design system.** `:root` holds surfaces (`--bg`, `--panel`, `--raised`, `--rule`), a three-step text ramp (`--ink`, `--ink-2`, `--ink-3`), signal colours reserved strictly for state (`--ok`, `--warn`, `--bad`, `--info`), the two charger-tier hues in mark and text variants, `--mono`/`--sans` stacks, `--gap` and `--radius`.
- **CSS Grid for every layout.** `auto-fit` + `minmax()` for the panel rows, explicit `fr` tracks for the board. No flexbox-only layout system, no grid library.
- **Plain class names, sectioned by comment banners** (`--- layout`, `--- panel`, `--- KPI strip`, `--- charts`, …). No BEM, no CSS modules, no styled-components.
- **Responsive by a handful of hand-placed breakpoints**: 1250px, 1000px, 900px, 760px, 560px. Plus a `prefers-reduced-motion: reduce` block.
- **System font stacks**, no web fonts, so nothing is fetched at runtime.

## 8. Charts

`src/ui/components/chart.tsx` provides the SVG primitives (`Plot`, the `Series` type, the `SERIES` colour pair) and the two trend charts build on it. The rules it encodes are not negotiable per-chart: one axis per plot (two measures of different scale become two stacked plots sharing an x-axis, never two y-scales); 2px marks with a recessive grid and selective direct labels; `null` is a gap in the line, not a zero; series colours come from the validated categorical pair while status colours stay reserved for thresholds; a crosshair readout ships by default.

## 9. Performance

Measured 2026-08-19 on the roadside hub, seed `s1`, via `tsx` on the same tick code the browser runs. Absolute milliseconds are machine-specific; the *ratios* and the growth curve are the point, and both reproduce.

**The render side is not the bottleneck. `structuredClone` is.**

### 9.1 The tick cost is the clone

`tick()` deep-clones the whole state into a draft (`src/game/core/tick.ts:56`). That clone grows all day:

| Sim tick | State | `structuredClone` | Whole `tick()` |
| --: | --: | --: | --: |
| 1 | 6 KB | 0.06 ms | 0.13 ms |
| 400 | 69 KB | 0.36 ms | 0.42 ms |
| 800 | 161 KB | 0.78 ms | 0.86 ms |
| 1400 | 231 KB | 1.05 ms | 1.29 ms |

By the end of the day the clone is **93% of the tick**. What grows is not live state — it is four append-only histories that no system mutates once written:

| Field | At 24:00 | Entries |
| :-- | --: | --: |
| `departedVehicles` | 150.9 KB | 454 |
| `eventLog` | 43.8 KB | 400 |
| `tickSamples` | 27.5 KB | 60 |
| `completedSessionIds` | 2.3 KB | 302 |
| everything else | ~6 KB | — |

Cloning the same end-of-day state with those excluded:

```
full state                 1.03 ms
without departedVehicles   0.45 ms
without all four           0.04 ms   ← 25× cheaper
```

`departedVehicles` is also swept in full every tick by the invariant checks (`src/game/validation/invariants.ts:90,139,145,148`) — a second, independent O(n) pass over the same growing array.

### 9.2 Steady state is fine; the catch-up frame is not

At 4× the loop runs 19.2 ticks per real second — about 25 ms of sim work per second, ~2.5% of a core. That is not what a player would feel.

What they would feel is one frame. `useGameLoop` spends up to `MAX_TICKS_PER_FRAME` (12) ticks **synchronously inside a single rAF callback**, and that cap is a count, not a time budget:

| Sim tick | 12-tick catch-up frame |
| --: | --: |
| 200 | 2.7 ms |
| 700 | 8.9 ms |
| 1300 | 14.5 ms |

14.5 ms against a 16.7 ms budget, before React renders anything — and that is on a development machine. On hardware 2–3× slower a late-day catch-up frame is 30–45 ms: a visible hitch, arriving when the board is busiest. This matters for Phase 4 specifically, where criteria 1 and 5 are measured on testers' own machines.

### 9.3 What is already cheap

Do not spend effort here:

- **Bundle.** 293 KB raw / **89.5 KB gzipped**, 81 modules, 677 ms build. The worker is a separate 53.6 KB chunk because it re-bundles the sim core, which is correct. One screen needs no code splitting.
- **DOM.** 714 elements on a mid-day board, 53 of them SVG. React reconciles that comfortably at tick rate.
- **Memoisation placement.** The three memoised components are the three that need it, and they take scalar props for the reason in §6.
- **Dependencies.** Two at runtime. There is no framework weight to strip.

### 9.4 Levers, in order

Recorded here as measured options, not as decisions taken.

1. **Keep the append-only histories out of the cloned draft.** Biggest win by a distance, and the front end simply stops paying for it. Guard rails exist — `tests/determinism.test.ts` and the `departedVehicles` assertions in `tests/invariants.test.ts` — but `hashState` reads the state, so check whether the D26 same-seed-same-hash contract survives the restructure or needs re-baselining. `departedVehicles` alone buys two-thirds of it.
2. **Make the invariant sweep incremental** — check the vehicle that just departed, not all 454, every tick.
3. **Spend a time budget rather than a tick count in `useGameLoop`.** Stop the catch-up loop at ~8 ms elapsed instead of at 12 ticks; the debt-clamp semantics are unchanged and it adapts to slow hardware instead of assuming a tick is cheap. `spendDebt` is already pure and tested, so the change is contained.
4. **React Compiler** (`babel-plugin-react-compiler`) — not installed. The one stack *addition* worth considering: it auto-memoises a tree that re-renders 5–19× per second, without hand-placing `memo` on eighteen more components. Low risk on React 19.
5. **`useSyncExternalStore` with per-panel selectors** — the structural ceiling, and what D17 was weighing before D28 deferred it. Every tick replaces the root state and re-renders all ~21 panels. Hold off: at 714 DOM nodes React is comfortable, and this is the largest change for the least measured benefit. Revisit if 1–4 are not enough.

### 9.5 A note on profiling this app

Browser profiling needs a genuinely visible tab. Because D40 leaves rAF as the sole driver, a hidden tab does not slow the day down — it stops it dead, and `setTimeout` is clamped to 1 s alongside, so any timing taken there measures throttling rather than work. Headless or backgrounded preview panes will report a clock frozen at 00:00. Profile the sim under `tsx`, or the render in a foregrounded window.

## 10. Testing the front end

`vitest.config.ts` includes `tests/**/*.test.ts` in a **`node`** environment. There is no jsdom and no component-rendering harness, which is a real constraint: **components are not unit-tested.** What is covered instead:

- `tests/gameLoop.test.ts` — the pure `spendDebt` arithmetic, no renderer needed.
- `tests/contrast.test.ts` — parses `src/styles/app.css` itself and asserts WCAG 2.1 AA ratios for the shipped custom properties, at 4.5:1 for text and 3:1 for chart marks. It exists because the theme once shipped every small label at 3.2–3.9:1.

So a UI change is verified by `npm run typecheck` and by looking at it in the dev server; the simulation test suite is for simulation changes.

## 11. Where things live

```
index.html                       Vite entry
vite.config.ts                   plugin-react, port 5273 (PORT overrides)
tsconfig.json                    one config, src + tests
src/main.tsx                     createRoot, StrictMode, the one CSS import
src/app/App.tsx                  the whole layout — Architecture §8.1
src/styles/app.css               the entire stylesheet
src/ui/hooks/useSimulation.ts    the store (useReducer over SimulationState)
src/ui/hooks/useGameLoop.ts      rAF → ticks, D26 + D40
src/ui/workers/baseline.worker.ts end-of-day baseline, off-thread
src/ui/components/               24 components; Panel.tsx and chart.tsx are shared
src/ui/format.ts                 number/unit/clock formatting
```

Related: `ChargePointOperator_Architecture.md` §8 (dashboard layout, component cut, component–state mapping) and `ChargePointOperator_Decision_Log.md` (D17, D26, D28, D40, D41).
