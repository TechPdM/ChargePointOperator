# ChargePointOperator

A dashboard-first simulation game about running one EV charging site under pressure. You set price, power policy, charging limits, maintenance level and which bays are open; the queue, the grid cap and the faults do the rest.

**Status: Phase 2 built — the dashboard plays.** A full compressed day runs in the browser and scores itself.

The design documents are canonical and come first:

| Document | Canonical for |
| :-- | :-- |
| `ChargePointOperator_Plan.md` | what and why — scope, phases, the gate |
| `ChargePointOperator_Architecture.md` | how — data model, tick pipeline, logging, invariants |
| `ChargePointOperator_KPI_Dictionary.md` | **meaning** — one precise definition per KPI |
| `ChargePointOperator_Calibration.md` | constants and assumptions |
| `ChargePointOperator_Scenario_RoadsideHub.md` | the MVP scenario |
| `ChargePointOperator_Decision_Log.md` | decisions taken, and the sole home of open items |
| `ChargePointOperator_Playtest_Protocol.md` | the Phase 4 script, frozen before the build |
| `ChargePointOperator_Phase1_Findings.md` | what the first 20-seed batch actually measured |

Where code and documents disagree, the documents win — fix the document first, then the code.

## Running it

```bash
npm install
```

The dashboard:

```bash
npm run dev
```

One run, printed as a summary:

```bash
npm run sim -- run --seed s1
```

The 20-seed baseline batch — mean and p10/p90 per KPI, plus the D13 difficulty-floor check:

```bash
npm run baseline
```

Tick-by-tick trace around the 12:30 scripted fault:

```bash
npm run sim -- trace --seed s1 --from 740 --to 780
```

Export a full NDJSON event log:

```bash
npm run sim -- run --seed pt-1 --ndjson runs/pt-1.ndjson
```

Policy overrides work on `run` and `batch`, which is how the maintenance and partial-charge findings were measured:

```bash
npm run sim -- batch --seeds 20 --maintenance preventive --partial 0.7 --grid 120
```

Tests and typecheck:

```bash
npm test
```

```bash
npm run typecheck
```

## Layout

```
src/game/
  core/        types · rng · tick pipeline · selectors · run harness · calibration
  systems/     arrivals · admission · queue · power · charging · faults · economics · trust · scoring
  actions/     the seven canonical player actions
  scenarios/   roadsideHub (Phase 3 adds commuterHub, destinationSite)
  logging/     NDJSON schema · logger · run manifest · replay
  validation/  nine invariants · failure-state detection · trace mode
  experiment/  baseline actor · run summaries · played-vs-baseline comparison
  headless.ts  CLI entry point
src/ui/
  components/  the 15-component MVP cut, one file each
  hooks/       useSimulation (store) · useGameLoop (fixed timestep)
src/app/       App.tsx — the §8.1 layout
tests/         87 tests, each pinned to the document that defines the rule
```

## Three rules the code is held to

- **No control without a mechanic**, and no field without a reader. A field with no formula behind it is a control with no mechanic wearing a different hat.
- **Schema changes travel in pairs.** The action union, the event catalogue, the dashboard bindings and the systems that consume them change together — invariant 8 makes drift a test failure. The KPI dictionary is canonical for *meaning*; matching names are not matching definitions.
- **Determinism is load-bearing.** One seeded PRNG stream, a fixed timestep, no wall-clock in sim state. Same seed plus same action stream ⇒ same final state hash, and a run replays from its own log.
