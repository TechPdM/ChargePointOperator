# ChargePointOperator — System Architecture

An overview of the system **as built**, for a technical architect coming to the repo fresh. It covers the shape of the system, the build toolchain, the simulation core (the "backend"), the dashboard (the front end), and the contracts that hold them together.

This file is a map, not the spec. The design documents in `docs/` are canonical and go into more depth. Where this file and they disagree, they are right:

| For | Read |
| :-- | :-- |
| Data model, tick pipeline, logging schema, invariants (the design spec) | `docs/ChargePointOperator_Architecture.md` |
| Front-end stack, conventions, measured performance | `docs/ChargePointOperator_Frontend_Stack.md` |
| KPI meanings · constants · decisions | `docs/ChargePointOperator_KPI_Dictionary.md` · `_Calibration.md` · `_Decision_Log.md` |
| Every variable and causal path in the model, read from the code | `docs/model-map.html` (open in a browser) |

---

## 1. System at a glance

ChargePointOperator is a **single-player, browser-only simulation game**. The player runs one EV charging site for a simulated 24-hour day, adjusting price, power policy, maintenance and bay availability while a seeded stochastic model generates arrivals, queues, faults and money.

There is **no server, no database, no network I/O, and no authentication.** All state lives in memory in one browser tab. Everything the system persists, it persists by **exporting files**: run logs downloaded from the browser, or written to `runs/` by the CLI.

```
                    ┌──────────────────────────────────────────────┐
                    │        src/game/  — simulation core          │
                    │  pure TypeScript, zero runtime dependencies  │
                    │                                              │
                    │  core · systems · actions · scenarios        │
                    │  logging · validation · experiment           │
                    └──────▲──────────────▲───────────────▲────────┘
                           │              │               │
          ┌────────────────┴───┐  ┌───────┴───────┐  ┌────┴─────────────┐
          │ Browser dashboard  │  │ Headless CLI  │  │ Test suite       │
          │ React 19 + Vite    │  │ tsx           │  │ Vitest (node)    │
          │ src/ui, src/app    │  │ headless.ts   │  │ tests/           │
          │  + Web Worker      │  │ → runs/*.json │  │                  │
          └────────────────────┘  └───────────────┘  └──────────────────┘
```

The sim core is the system. It has three hosts that run the **same code**: the dashboard, the CLI and the tests. The core imports nothing from the other three and knows nothing about React or the DOM.

### Size

About 13.6k lines of TypeScript/TSX/CSS, measured at this commit:

| Area | Files | Lines |
| :-- | --: | --: |
| `src/game/` (sim core + CLI) | 37 | ~7,000 |
| `src/ui/`, `src/app/`, `src/main.tsx` | 24 | ~2,900 |
| `src/styles/app.css` | 1 | ~1,530 |
| `tests/` | 8 | ~2,200 (131 test cases) |

---

## 2. Build tooling

| Tool | Version | Role |
| :-- | :-- | :-- |
| **Node.js / npm** | — | Package management (`package-lock.json` committed). ESM throughout (`"type": "module"`). |
| **TypeScript** | ^5.7 | Type checking only (`noEmit`). One `tsconfig.json` covers `src/`, `tests/` and the Vitest config. |
| **Vite** | ^6.0 | Dev server with HMR (port 5273, override with `PORT`), production bundling, Web Worker bundling. |
| **@vitejs/plugin-react** | ^4.7 | JSX transform and React Fast Refresh. The only Vite plugin. |
| **tsx** | ^4.19 | Runs `src/game/headless.ts` directly under Node, with no compile step. |
| **Vitest** | ^2.1 | Test runner, `node` environment, 120s per-test timeout (some tests run whole simulated days). |

**Runtime dependencies: two** — `react` and `react-dom`. Everything else is a dev dependency.

There is **no linter or formatter configured** (the design spec names ESLint + Prettier; neither is installed), **no CI pipeline** and **no deployment target**. `dist/` is a local build artefact and is gitignored.

### Scripts

| Command | Does |
| :-- | :-- |
| `npm run dev` | Vite dev server for the dashboard |
| `npm run build` | `tsc --noEmit && vite build`. The type check gates the bundle. |
| `npm run typecheck` | Type check alone |
| `npm test` / `npm run test:watch` | Vitest |
| `npm run sim -- <command> [flags]` | Headless CLI (§4.6) |
| `npm run baseline` | 20-seed baseline batch |

### TypeScript settings that shape the code

- `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals` and `noUnusedParameters`: indexing a record yields `T | undefined`, so the core uses `mustBay()` / `mustVehicle()` helpers that fail loudly.
- `allowImportingTsExtensions` + `moduleResolution: "bundler"`: **every local import carries its extension** (`./tick.ts`, `./Panel.tsx`). The same source runs under Vite, tsx and Vitest without a build step.
- `verbatimModuleSyntax`: type-only imports must be written `import type`.
- `lib: ["ES2022", "DOM"]`, not WebWorker. The worker narrows `self` by hand for this reason.

### Build output

A production build is one HTML file, one JS bundle (~293 KB raw, ~90 KB gzipped), one CSS file, and a separate ~54 KB worker chunk. The worker chunk re-bundles the sim core. It is a fully static site that any static host could serve. None is configured.

---

## 3. Repository layout

```
index.html                 Vite entry → /src/main.tsx
vite.config.ts             react plugin, dev port
vitest.config.ts           tests/**/*.test.ts, node env
tsconfig.json              one config for everything

src/
  main.tsx                 createRoot + StrictMode + the one CSS import
  app/App.tsx              the whole dashboard layout (single screen, no router)
  game/                    ── SIMULATION CORE (no UI imports) ──
    core/                  types · tick pipeline · init · rng/hash · selectors · run harness · calibration constants
    systems/               arrivals · admission · queue · power · charging · faults · economics · trust · scoring · vehicles
    actions/               the seven player actions: validation + application
    scenarios/             roadsideHub (MVP) · commuterHub · destinationSite · lookup
    logging/               NDJSON event schema · logger · run manifest · replay
    validation/            per-tick invariants · failure-state + alert detection · trace mode
    experiment/            baseline/passive actors · run comparison · sweeps · strategy/dominance tests · gate evidence
    headless.ts            CLI entry point
  ui/
    hooks/                 useSimulation (the store) · useGameLoop (real time → ticks)
    workers/               baseline.worker.ts (end-of-day scoring, off the main thread)
    components/            one file per panel; Panel.tsx (frame) and chart.tsx (SVG primitives) are shared
    format.ts              number, unit and clock formatting
  styles/app.css           the entire stylesheet

tests/                     determinism · invariants · mechanics · power · failure states · logging · game loop · contrast
docs/                      design documents (canonical), findings, decision log, model map
runs/                      CLI outputs (gitignored; reproducible from seed)
```

---

## 4. Simulation core (`src/game/`) — the "backend"

### 4.1 Core contract

The system is built around one pure function:

```ts
tick(state: SimulationState, options?): { state: SimulationState; events: PendingLogEvent[] }
```

- **Immutable in, immutable out.** `tick()` runs `structuredClone(state)` into a draft and runs every system over that draft through a shared `TickContext` (`core/context.ts`). It returns the new state and the events emitted during the tick. The input is never touched.
- **Player actions are queued, not applied.** `queueAction(state, action)` adds the action to `state.pendingActions`. The next tick drains the queue as its first step. Input is continuous, with no turn or decision window.
- **One root state.** `SimulationState` (`core/types.ts`) holds the clock, the scenario config, the RNG position, the site (policy, economics, metrics), the chargers, the vehicles, the queue, the sessions, pending actions, a 400-entry event ring and append-only histories. It is plain JSON-serialisable data, with no classes and no functions.

### 4.2 Tick pipeline

The systems run in a fixed order (`core/tick.ts`). The order is part of the contract:

```
applyPlayerActions → spawnArrivals → evaluateDemandAcceptance → assignToIdleBaysOrQueue
→ rebalancePower → advanceActiveSessions → resolveFaultsAndRepairs → applyPendingBayTransitions
→ processQueueAbandonment → refillIdleBaysFromQueue → applyOperatingCosts → updateTrust
→ updateKPIs → detectFailureStates → detectAlerts → emitSnapshot → checkInvariants
→ (final tick only) closeOutRun
```

Three of these orderings carry weight: faults detach the session before the bay is marked faulted; latched close/upgrade requests apply after faults; and failure detection runs after KPIs and before invariants. Only the clock ends a run. There are no mid-day fail states. Goals are scored at close-out. See the design spec, §4.

### 4.3 Determinism: the system's central guarantee

Same scenario + same seed + same action stream ⇒ **bit-identical final state hash**. Replay, A/B comparison against a baseline, regression testing and the gate evidence all depend on this.

| Mechanism | Implementation |
| :-- | :-- |
| PRNG | `mulberry32`, **one global stream** drawn in pipeline order. Its position is serialised in `state.rngState` (8 hex chars), read at the top of each tick and written back at the end. |
| Seeds | Strings (`"s1"`, `"pt-1"`), hashed to a uint32 with FNV-1a. |
| State hash | FNV-1a over canonical JSON (sorted keys), excluding `eventLog` (`core/rng.ts`). |
| Timestep | Fixed. `deltaSeconds` is always `scenario.tickSeconds` (60s), giving 1,440 ticks per day. Speed changes ticks per real second, never the tick size. |
| Banned in `game/` | `Math.random()`, `Date.now()` and `new Date()`. The only wall clock is an injectable `WallClock` in `logging/manifest.ts`. IDs come from monotonic counters held in state. |
| Iteration order | Bays iterate in scenario-roster order, never `Record` key order (`bayList()`). |

`tests/determinism.test.ts` enforces this, and so does `logging/replay.ts`, which rebuilds a run **from its NDJSON log alone**.

### 4.4 Domain model, in brief

- **Scenarios** (`scenarios/`) are complete `ScenarioConfig` data: bay roster, grid cap, demand waves, prices, costs, scripted faults, goals. There are three archetypes (corridor hub, commuter hub, destination site). The dashboard plays `roadsideHub`. The CLI takes `--scenario`.
- **Vehicles** arrive by demand wave, with archetype-specific sensitivities. They are admitted or rejected by a site score, then queue, charge, abandon, or are interrupted by faults. Every vehicle ends in exactly one bucket of the demand funnel.
- **Power** is a shared grid cap, split each tick by one of four policies: `equal_share`, `fast_first`, `queue_relief` or `manual`.
- **Player actions** (`actions/playerActions.ts`) form a closed union of seven: `set_price`, `set_power_policy`, `toggle_bay_group`, `schedule_repair`, `set_maintenance_level`, `upgrade_charger`, `set_partial_charge_target`.
- **Constants** live in `core/calibration.ts`, with their rationale in `docs/ChargePointOperator_Calibration.md`.

### 4.5 Instrumentation: a first-class layer

| Module | Responsibility |
| :-- | :-- |
| `logging/schema.ts` | Typed `LogEventName` catalogue, `BaseLogEvent` (snake_case, `log_schema_version: 1`, sim time only), `RunManifest`. |
| `logging/logger.ts` | In-memory event store with level filter. Exports as NDJSON or as a JSON bundle. |
| `logging/manifest.ts` | Run manifest: seed, initial and final state hash, outcome, goals met, failure states observed. Wall-clock fields live here and nowhere else. |
| `logging/replay.ts` | Extracts the action stream from decision-marker events and re-runs it. |
| `validation/invariants.ts` | Nine invariants checked **every tick**: power ≤ cap, cash reconciliation, funnel identity, no session on a faulted or closed bay, SOC bounds, action↔event pairing, and others. Modes: `throw` (CLI/tests), `collect` (browser), `off` (sweeps). |
| `validation/failureStates.ts` | Detects the five named failure states and the alert thresholds. Detection only. Nothing here ends a run. |
| `validation/trace.ts` | Tick-by-tick trace over a window. |

### 4.6 Experiment harness and CLI

`core/run.ts` (`runScenario`) drives a full day headlessly. It takes an optional **policy actor**, a function `(state) => PlayerActionDraft[]` called before each tick, along with scripted actions, the invariant mode and the log level. The experiment layer builds on it:

- `baselinePolicy` / `passivePolicy` — reference operators. The dashboard scores the player against a passive run on the same seed.
- `compareRuns.ts` — run summaries, played-vs-baseline deltas, p10/mean/p90 statistics.
- `sweep.ts`, `strategies.ts`, `gateEvidence.ts` — parameter sweeps, dominant-strategy tests across all three archetypes, and the machine-measurable gate criteria.

`headless.ts` exposes these as subcommands (`run`, `batch`, `trace`, `sweep`, `archetypes`, `strategies`, `gate`), with policy-override flags (`--price`, `--power`, `--maintenance`, `--partial`, `--grid`, `--scenario`). Batch work is single-threaded and synchronous. A day takes roughly 1–2s.

---

## 5. Front end (`src/ui/`, `src/app/`)

### 5.1 Stack

React 19 function components in `StrictMode`, mounted from `src/main.tsx`. The dashboard is **one screen with no router**. The project deliberately goes without a state library, a chart library, a CSS framework and a component library. Each absence is a recorded decision (D28; see `Frontend_Stack.md` §1).

### 5.2 Data flow

```
 user input ──► sim.act(action) ──► dispatch "queue" ──► queueAction(state.sim)
                                                              │
 requestAnimationFrame ──► useGameLoop ──► dispatch "tick" ──► tick(state.sim)  (sim core)
                                                              │
                                    new SimulationState ◄─────┘
                                              │
                         App.tsx ──props──► panels (read via selectors / format.ts)
```

- **Store** — `useSimulation` (`ui/hooks/useSimulation.ts`) is a single `useReducer` over the full `SimulationState`, plus UI bookkeeping: snapshot history for the charts, a 300-event display buffer, action history, speed, pause, run sequence number. It contains **no game logic**. It only calls `queueAction`, `tick` and the selectors. `App.tsx` calls it once and passes the `sim` object down as props. There is no React context.
- **Game loop** — `useGameLoop` converts real time into whole ticks over `requestAnimationFrame`. At 1× speed it runs 4.8 ticks per second, so a day takes 5 real minutes. It caps the work per frame (12 ticks) and the carried debt, so a backgrounded tab drops the missed time rather than fast-forwarding on return. The debt arithmetic is a pure, tested function (`spendDebt`).
- **Web Worker** — at the end of the day the store asks `ui/workers/baseline.worker.ts` to simulate the same seed under the passive policy (~1.8s) and compare it with the player's run. Only plain data crosses the boundary: the scenario travels as an id. Replies carry a `runSeq` so a reply for a superseded run is dropped. If the worker fails, scoring falls back to the main thread.
- **Export** — "Export" downloads a JSON bundle (manifest, events, actions) and an NDJSON event log via `Blob` URLs. This is the system's only persistence path, and it is how playtest runs are collected.

### 5.3 Components and styling

- Each panel is its own file in `ui/components/`. `Panel` is the common frame. `chart.tsx` holds hand-rolled SVG plot primitives: one axis per plot, nulls drawn as gaps, crosshair readout.
- `memo` is used only on the charts and the event log. They take scalar props because `state` is a new object every tick.
- A `<fieldset disabled>` locks every control once the day is scored.
- Styling is one hand-written `app.css`. Custom properties act as design tokens, layouts use CSS Grid, there are five breakpoints and a `prefers-reduced-motion` block. Fonts are system fonts, so nothing is fetched at runtime. `tests/contrast.test.ts` parses the stylesheet and checks WCAG AA contrast ratios.

---

## 6. Cross-cutting contracts

These rules apply across module boundaries. Changes that touch any of them need care.

1. **Paired schema.** The `PlayerAction` union, the `LogEventName` catalogue, the dashboard controls that write actions, and the systems that consume them change **together**. Invariant 8 checks that every action type has exactly one decision-marker event, so drift fails a test.
2. **No control without a mechanic, no field without a reader.** Fields with no formula behind them get removed rather than kept.
3. **Units.** The sim stores fractions (0–1). Logs emit `*_pct` (0–100), and conversion happens only at the log boundary. Field names carry their units (`_seconds`, `_kw`, `_amount`).
4. **Sim time only inside `game/`.** No wall clock enters sim state or events. The manifest is the single exception.
5. **Documents before code.** Where code and a design document disagree, the document is fixed first and the code follows. `docs/model-map.html` is the exception: it describes the code as built.

---

## 7. Testing and verification

| Suite | Covers |
| :-- | :-- |
| `determinism.test.ts` | Same seed ⇒ same hash; replay from NDJSON reproduces the run |
| `invariants.test.ts` | The nine invariants over full runs, plus the final-state checks |
| `mechanics.test.ts` | Arrivals, admission, queueing, charging, faults, economics, trust (the largest suite) |
| `power.test.ts` | The four allocation policies and the cap |
| `failureStates.test.ts` | Failure-state and alert detection |
| `logging.test.ts` | Schema, logger, manifest |
| `gameLoop.test.ts` | Real-time debt arithmetic |
| `contrast.test.ts` | Stylesheet colour contrast |

Every test runs in Node. **No React component is tested**: there is no jsdom and no Testing Library. UI changes are checked with `npm run typecheck` and by eye in the dev server. The sim suites exist for sim changes.

---

## 8. Known constraints and risks

These are recorded for whoever plans the next phase. The measurements are in `Frontend_Stack.md` §9.

- **Per-tick cost grows through the day.** `structuredClone` of the whole state accounts for ~93% of a late-day tick, because four append-only histories (`departedVehicles`, `eventLog`, `tickSamples`, `completedSessionIds`) are cloned on every tick. The invariant sweep also scans `departedVehicles` in full on every tick. Moving the histories out of the cloned draft would make the clone ~25× cheaper, but it touches `hashState`, so the determinism baseline needs care.
- **Frame jank on slower machines.** The game loop caps a catch-up frame by tick count (12), not by time. A late-day catch-up frame takes ~14.5ms on a development machine and could take 30–45ms on hardware 2–3× slower. A time budget would fix this.
- **Full re-render per tick.** Every tick replaces the root state and re-renders all panels. This is acceptable at ~700 DOM nodes. If it stops being acceptable, the options are React Compiler and then `useSyncExternalStore` with per-panel selectors.
- **Single-threaded batch CLI.** Sweeps and strategy tests run sequentially. Runs are independent and deterministic, so they could be parallelised across worker threads.
- **No CI, lint or format.** Type checking and tests run only when someone runs them by hand.
- **Hidden tabs pause the day.** `requestAnimationFrame` is the only driver, so a hidden tab stops the clock (decision D40). Browser profiling needs a visible tab.
