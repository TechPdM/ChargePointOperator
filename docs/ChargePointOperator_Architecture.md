# ChargePointOperator — MVP Architecture Document

**Version:** 1.4 · **Date:** 2026-08-16 *(v1.1: snapshot cadence per D9 · v1.2: D10/D14/D15 ratification updates · v1.3: final-review fixes · v1.4: readiness-review fixes — D19 interruption semantics, D20 `ScenarioConfig` completion, D21 demand/admission formulas, D23 power policies + reserve cut, D25 15-component cut, D26 determinism contract)*
**Companion to:** `ChargePointOperator_Plan.md` — the plan is canonical for *what and why*; this document is canonical for *how*.
**Source:** all code examples, schemas, structures and diagrams proposed in `original_perplexity_discussion.md`, extracted, cross-reviewed, and corrected.

**How to read this:** every artifact below carries a status tag:

- `VERBATIM` — taken from the discussion unchanged (it survived cross-review).
- `AMENDED (Cn/On)` — corrected per the numbered contradiction/omission resolutions in the plan. Inline `// AMENDED` comments mark the exact changes.
- `NEW` — required by a plan resolution but never written down in the discussion.

Where this document and the raw discussion disagree, **this document wins** — the disagreements are deliberate; that was the point of the review. Together with `ChargePointOperator_Calibration.md` (constants + assumptions register), this discharges the plan's **Phase 0 (Design Lock)** deliverable.

> **Phase 0 status (v1.4).** v1.3 claimed Phase 0 was discharged "in full". It wasn't: a readiness review found `queue_relief` undefined, no archetype reference price, `ScenarioConfig` unable to express its own scenario, and an invariant that contradicted the fault model. D19–D26 close those. Two numeric items remain open by design and are tracked as OPEN-2 and OPEN-3 in the decision log — they need measurement, not another guess, and Phase 1 is where the measuring happens.

---

## 1. Source inventory

Every code/structure artifact proposed in the discussion, and what happened to it:

| # | Artifact | Source part (turns) | Status here |
| :-- | :-- | :-- | :-- |
| 1 | Early entity list (`Site`, `Charger`, `Vehicle`…) | B (3) | Superseded by artifact 6 |
| 2 | gm-games rename map & module notes | C (4–6) | **Dropped** — fork path is void (D1) |
| 3 | Site / vehicle / charger state machines | J (14) | `AMENDED (C8)` — §4.2 |
| 4 | Tick pseudocode loop | J (14) | `AMENDED (C8, C11)` — §4.3 |
| 5 | Minimal formulas | J (14), K (15) | `AMENDED (C10)` — §6 |
| 6 | TypeScript data model | K (15) | `AMENDED (C4, C5, C10, C11, O2, O3)` — §5 |
| 7 | Derived selectors | K (15) | `VERBATIM` — §5.8 |
| 8 | Layer table & runtime flow | L (16) | `AMENDED (C2)` — §2 |
| 9 | Folder plan | L (16) | `AMENDED (C2, D6)` — §3 |
| 10 | Tick pipeline | L (16) | `AMENDED (C8)` — §4.1 |
| 11 | Dashboard layout & 23-component spec | M (17–18) | `AMENDED (C4, C5)` — §8 |
| 12 | Component–state mapping table | M (18) | `AMENDED (C4, C5)` — §8.3 |
| 13 | First `LogEvent` sketch | O (20) | Superseded by artifact 14 |
| 14 | TypeScript logging schema | O (21) | `AMENDED (C6, C11)` — §7 |
| 15 | Invariant / V&V list | P (22) | `AMENDED` (expanded) — §9 |

---

## 2. Stack and runtime architecture

**Stack (D7):** TypeScript sim core · React dashboard UI · no backend · local serialisable state · light store (`useReducer` or Zustand — build-time choice, D17) · chart library for trends. Everything runs in the browser; the sim core also runs headless (Node/tests) for Phase 1.

**Tooling — `NEW` (readiness review).** D17 defers the *store* and *chart* choices to Phase 2, which is right; but Phase 1 needs a toolchain on day one and none was named. Pinned: **Vite** (dev server + build), **Vitest** (test runner — invariants and the replay-determinism test are Phase 1 deliverables, so this cannot wait), **TypeScript `strict: true`**. *(ESLint + Prettier were pinned here too and never installed; dropped 2026-10-16 — `tsc` under `strict` with the unused-code checks is the only static gate.)* `headless.ts` runs under `tsx`/`vite-node` for CLI batches. None of this is load-bearing on the design; it's here so the first commit isn't a tooling decision.

### 2.1 System layers — `AMENDED (C2)`

| Layer | Responsibility |
| :-- | :-- |
| **Domain model** | Types for site, bays, vehicles, sessions, queue, policies (§5) |
| **Simulation engine** | Tick reducer, arrivals, assignment, charging progress, faults, KPI updates (§4) |
| **Game rules** | Scenario goals, trust rules, pricing effects, fail/success conditions |
| **Instrumentation** | Logging, run manifest, invariants, baseline runner, replay *(promoted to a first-class layer per D6/O4/O7 — the discussion filed this under "persistence/debug")* |
| **Presentation** | Dashboard components, charts, tables, event log (§8). *The discussion's "canvas site view" row is removed — no spatial rendering in MVP (C2/D3)* |

### 2.2 Runtime flow — `VERBATIM`

1. UI dispatches a player action.
2. Action is appended to `pendingActions`.
3. Game loop advances one tick.
4. Tick reducer runs systems in pipeline order (§4.1).
5. New immutable state is produced.
6. UI re-renders from selectors.

The core contract: `state = tick(state, deltaSeconds)` and `state = reduce(state, action)` are **pure**. No business logic lives in components; same seed + same action stream ⇒ same final state hash.

### 2.3 Determinism contract — `NEW (D26)`

D4 promises replay and invariant 9 tests it, but a promise needs mechanisms. These four are binding:

| Concern | Rule |
| :-- | :-- |
| **PRNG** | `mulberry32`. State is a single uint32, serialised into `SimulationState.rngState` as 8 lowercase hex chars. **One global stream**, drawn in pipeline order — never per-system streams, which reorder under refactoring and break replay silently. |
| **Seed** | `string` everywhere (so `pt-1` is a legal seed). Hashed to the initial uint32 with FNV-1a. Numeric-looking seeds are still strings. |
| **State hash** | FNV-1a over canonical JSON: object keys sorted, `eventLog` excluded (it's a ring buffer, not state). |
| **Timestep** | **Fixed.** `deltaSeconds` is always `scenario.tickSeconds` (60). The UI speed control changes how many ticks run per real second and *never* the tick size. A variable timestep breaks replay on the first frame-rate hiccup. |

`Math.random()`, `Date.now()` and `new Date()` are banned in `game/` outside tests. `rng.ts` is the only randomness source; wall-clock lives only in the run manifest (C11).

---

## 3. Repository structure — `AMENDED (C2, D6)`

```text
src/
  app/
    App.tsx
    routes.ts
  game/
    core/
      types.ts            // §5 — the canonical data model
      reducer.ts
      tick.ts             // §4.1 pipeline
      selectors.ts        // §5.8
      rng.ts              // seeded PRNG — the ONLY randomness source
    systems/
      arrivals.ts
      admission.ts
      queue.ts
      charging.ts
      power.ts
      faults.ts
      economics.ts
      trust.ts
      scoring.ts
    scenarios/
      roadsideHub.ts      // MVP scenario (D5)
      commuterHub.ts      // Phase 3 (O6)
      destinationSite.ts  // Phase 3 (O6)
    actions/
      playerActions.ts    // §5.6 — matched pair with logging/schema.ts (C6 rule)
    logging/              // NEW dir — promoted from debug/ (D6)
      schema.ts           // §7
      logger.ts
      manifest.ts
    validation/           // NEW dir (O7)
      invariants.ts       // §9.1
      failureStates.ts    // NEW (D24) — detection rules; definitions in the KPI dictionary
      trace.ts            // §9.2
    experiment/           // NEW dir (O4)
      baselinePolicy.ts   // fixed-policy scripted actor
      compareRuns.ts
    headless.ts           // NEW — Phase 1 CLI/test entry point; runs scenarios with no UI
  ui/
    components/           // matches the §8.2 MVP cut — one file per component
      ScenarioHeader.tsx
      RunControls.tsx
      KpiCardGrid.tsx
      PricingControlPanel.tsx
      PowerPolicyPanel.tsx
      MaintenancePanel.tsx
      BayAvailabilityPanel.tsx
      ChargingPolicyPanel.tsx
      ActiveQueueTable.tsx
      FaultsAndRepairsPanel.tsx
      DiagnosisPanel.tsx      // promoted to MVP (D25)
      AlertsFeed.tsx          // promoted to MVP (D25)
      WaitTimeTrendChart.tsx
      EconomicsTrendChart.tsx
      EventLogPanel.tsx
    hooks/
      useGameLoop.ts
      useSimulation.ts
  styles/
```

Changes from the discussion's tree: `SiteCanvas.tsx`, `ChargerBay.tsx` (sprite), `assets/` and the canvas layer are **removed** (C2); `debug/` is replaced by first-class `logging/`, `validation/`, `experiment/` (D6); `headless.ts` is added so Phase 1 runs before any UI exists; `destinationSite.ts` added (O6). Build order (Part L, still correct): `types.ts` → `tick.ts`/`reducer.ts` → systems → *headless runs* → dashboard.

---

## 4. Simulation core

### 4.1 Tick pipeline — `AMENDED (C8)`

```text
tick()
  -> applyPlayerActions()          // pending actions drained here — any time, no gate (C8)
  -> spawnArrivals()
  -> evaluateDemandAcceptance()
  -> assignToIdleBaysOrQueue()
  -> rebalancePower()
  -> advanceActiveSessions()
  -> resolveFaultsAndRepairs()     // AMENDED (D19): detach session BEFORE faulting the bay
  -> applyPendingBayTransitions()  // NEW (D19): deferred close / upgrade land on idle bays
  -> processQueueAbandonment()
  -> refillIdleBaysFromQueue()
  -> updateEconomics()
  -> updateTrustAndKPIs()
  -> detectFailureStates()         // NEW (D24) — detection only, does not end the run
  -> checkInvariants()             // NEW step (O7) — throws in dev, logs in prod
  -> (D41: no outcome check)       // nothing ends a day but the clock; the D18 close-out sweep runs on the final tick
```

**Ordering rules that are load-bearing, not incidental:**

- `resolveFaultsAndRepairs` **finalizes and detaches the session first, then** sets the bay to `faulted` (D19). Reversing these two lines makes invariant 4 fire on every fault.
- `applyPendingBayTransitions` runs after faults so a bay freed by an interruption can absorb a pending close or upgrade in the same tick.
- `detectFailureStates` runs after KPIs (it reads them) and before invariants (so a detected state is in state when the invariant sweep looks).

### 4.2 State machines

**Site loop — `AMENDED (C8)`:** the discussion's `[PLAYER_DECISION_WINDOW]` state is deleted; player input is continuous and applied at the top of the next tick.

```text
[PREPARE_TICK] → [SPAWN_ARRIVALS] → [ADMISSION_DECISION] → [QUEUE_OR_ASSIGN]
     → [CHARGING_ACTIVE] → [RESOLVE_EVENTS] → [UPDATE_KPIS] → [PREPARE_TICK]
```

**Vehicle — `AMENDED (D19)`:** the discussion's version had no exit from `[CHARGING]` except `[COMPLETE]`, so a fault mid-session left the vehicle stranded with no terminal state and no leave reason — breaking invariant 7 and the funnel identity's `interrupted_by_fault` bucket. Fixed:

```text
[ARRIVING] → [EVALUATING_SITE] ─┬→ [LEAVE] (reject_site | site_full)
                                ├→ [QUEUEING] ─┬→ [ABANDON_QUEUE] → [LEAVE] (queue_abandon)
                                │              ├→ [START_CHARGING]
                                │              └→ [LEAVE] (scenario_end — D18 sweep)
                                └→ [START_CHARGING] → [CHARGING] ─┬→ [COMPLETE] → [LEAVE]
                                                                  └→ [LEAVE] (service_interrupted — D19)
```

**Charger bay — `AMENDED (D19)`:** deferred close/upgrade added. A close or upgrade requested while the bay is busy is *latched*, not applied — the bay stops taking new work immediately and transitions when it next reaches `idle`.

```text
[IDLE] → [ALLOCATED] → [CHARGING] ─┬→ [COMPLETE] → [IDLE]
                                   └→ [FAULTED] → [REPAIRING] → [IDLE]

  latched on any busy state:  closeRequested → isOpen = false   } applied at
                              pendingUpgradeType → spec swapped  } next [IDLE]
```

### 4.3 Tick loop pseudocode — `AMENDED (C8, C11)`

```pseudo
init simState from scenario (seeded RNG)                    // C11: no wall clock in state

while simState.running:

    applyPendingPlayerActions(simState)                     // AMENDED (C8): moved to tick
                                                            // start; decision-window removed
    wave = getActiveWave(simState.clock, scenario.demandWaves)           // AMENDED (D21)
    arrivals = spawnArrivals(wave, site.policy.pricePerKwh,              // absolute wave rate
                             scenario.referencePricePerKwh)              // × price multiplier

    for ev in arrivals:
        ev.expectedWait = estimateWaitTime(queue, chargers, site.gridPowerKw)
        ev.siteScore = scoreSite(ev, site.policy.pricePerKwh,            // AMENDED (D21):
                                 ev.expectedWait, metrics.trust)         // reads the vehicle's
        if ev.siteScore < ACCEPT_THRESHOLD:                              // own price/wait
            markLeave(ev, "reject_site"); continue                       // sensitivities
        if queue.length >= scenario.maxQueueLength:                      // NEW (D20): site_full
            markLeave(ev, "site_full"); continue                         // is now reachable
        freeCharger = findCompatibleFreeCharger(ev, chargers)
        if freeCharger: startSession(ev, freeCharger, simState.clock)
        else: enqueue(queue, ev)

    rebalancePower(chargers, site.gridPowerKw, site.policy.powerPolicy)  // §6.1 (D23)

    for charger in chargers where state == CHARGING:
        advanceCharging(charger, deltaSeconds)
        if sessionComplete(charger.session):                             // AMENDED (C4):
            finalizeSession(charger.session, metrics)                    // maintenanceLevel
            charger.state = IDLE                                         // is now a policy
        else if randomFaultOccurs(charger, site.policy.maintenanceLevel):
            // AMENDED (D19): detach BEFORE faulting, or invariant 4 fires every time.
            interruptSession(charger.session, metrics)   // completed=false,
            markLeave(charger.vehicle, "service_interrupted")  // interruptedByFault=true
            charger.state = FAULTED

    applyPendingBayTransitions(chargers)                     // NEW (D19): latched close/upgrade

    for ev in queue:
        ev.waitSeconds += deltaSeconds
        if shouldAbandon(ev.waitSeconds, ev.patienceSeconds, site.policy.pricePerKwh):
            markLeave(ev, "queue_abandon"); metrics.trust -= TRUST_HIT_ABANDON

    for charger in chargers where state == IDLE:
        nextEV = dequeueCompatibleEV(queue, charger)
        if nextEV: startSession(nextEV, charger, simState.clock)

    applyOperatingCosts(site, chargers, metrics)            // AMENDED (C10): includes
    updateKPIs(simState)                                    // energy cost + fixed opex
    detectFailureStates(simState)                           // NEW (D24): detection only
    checkInvariants(simState)                               // NEW (O7)
    // D41: no outcome check — the clock is the only thing that ends a day
    advanceSimTime(simState.clock, deltaSeconds)            // AMENDED (C11): sim-seconds only
                                                            // deltaSeconds is ALWAYS
                                                            // scenario.tickSeconds (D26)

closeOutRun(simState)     // NEW (D18/D19): after the final tick — finalize still-charging
                          // sessions as completed (partial delivery recorded), mark
                          // still-queueing vehicles left with reason "scenario_end".
```

### 4.4 Repair rules — `NEW` (readiness review)

The model had `schedule_repair`, `repairSecondsMean`, maintenance multipliers and a fault/repair downtime split, but never said what triggers a repair. Without that, `downtimeFaultSeconds` and `downtimeRepairSeconds` are indistinguishable and baseline uptime is a coin flip. Pinned:

- A faulted bay stays `faulted` **indefinitely** until the player (or the baseline actor) issues `schedule_repair`. Repairs are never automatic — that's the whole point of the maintenance mechanic.
- `schedule_repair` moves the bay `faulted → repairing`, stamps `repairScheduledAtSecond`, sets `repairDueAtSecond = now + round(repairSecondsMean × maintenanceRepairTimeMultiplier)`, and debits the per-repair cost **immediately**.
- `repairing → idle` when `secondsElapsed >= repairDueAtSecond`.
- **No concurrency limit** in MVP — all six bays can repair simultaneously. A technician-availability constraint is a Phase 5 mechanic, not a silent MVP rule.
- `schedule_repair` on a bay that is not `faulted` is a **no-op** (logged at `warn`, no cost). The UI should disable the control rather than rely on this.
- Downtime accounting: `faulted` accrues `downtimeFaultSeconds`, `repairing` accrues `downtimeRepairSeconds`, `isOpen == false` accrues `downtimeClosedSeconds`. A bay can only be in one of the three.

The baseline actor's repair behaviour is pinned separately by D22: it calls `schedule_repair` on the tick a fault is detected.

---

## 5. Data model (canonical) — `AMENDED (C4, C5, C10, C11, O2, O3, D19–D26)`

### 5.1 Primitives and enums

```ts
export type Id = string;
// AMENDED (C11): `UnixMs` type deleted from the sim model entirely.
// All sim times are seconds since scenario start (`SimSeconds`).
export type SimSeconds = number;

export type VehicleArchetype = "commuter" | "enroute" | "panic_low_soc";
export type ChargerType = "slow_ac" | "rapid_dc" | "ultrarapid_dc"; // MVP scenarios use 2 of 3 (D5)
export type ChargerState = "idle" | "allocated" | "charging" | "faulted" | "repairing";
export type VehicleState =
  "arriving" | "evaluating_site" | "queueing" | "charging" | "complete" | "left";
export type QueueLeaveReason =
  | "completed"
  | "reject_site"          // failed the siteScore admission test — never joined
  | "site_full"            // queue at scenario.maxQueueLength (D20 — previously unreachable)
  | "queue_abandon"        // patience exceeded while queueing
  | "service_interrupted"  // NEW (D19): fault killed an active session
  | "scenario_end";        // NEW (D18): still queueing at 24:00

export type PowerPolicy = "equal_share" | "fast_first" | "queue_relief" | "manual";

// NEW (C6/D20): was an inline string union inside the fault log event only; the sim
// now needs it too (ScenarioConfig.scriptedFaults). "payment_fault" stays deleted.
export type FaultCategory =
  "connector_fault" | "power_module_fault" | "cooling_fault" | "software_fault" | "unknown";

// NEW (D24): detection-only — these do NOT end a run. Definitions in the KPI dictionary.
export type FailureState =
  "queue_collapse" | "power_choke" | "reliability_spiral" | "margin_trap" | "trust_crash";

// AMENDED (C4, D14): canonical action set — now SEVEN actions.
// `set_maintenance_level` added per C4; `set_partial_charge_target` promoted
// from stretch to core per D14 (ratified). `add_bay` deliberately absent (Phase 5).
export type PlayerActionType =
  | "set_price"
  | "set_power_policy"
  | "toggle_bay_group"
  | "schedule_repair"
  | "set_maintenance_level"
  | "upgrade_charger"
  | "set_partial_charge_target"; // CORE per D14 (was stretch)

// NEW (C4): backs the maintenance action; drives fault probability & repair speed.
export type MaintenanceLevel = "reactive" | "standard" | "preventive";
```

### 5.2 Clock, demand, policy

```ts
// AMENDED (C11): nowMs/deltaMs removed — wall-clock lives only in the RunManifest.
export interface GameClock {
  tick: number;
  deltaSeconds: number;
  secondsElapsed: SimSeconds;
  scenarioSecondsRemaining: SimSeconds;
}

export interface DemandWave {               // VERBATIM
  id: Id;
  startSecond: number;
  endSecond: number;
  arrivalRatePerMinute: number;
  commuterMix: number;
  enrouteMix: number;
  panicMix: number;
  priceElasticity: number;
}

export interface SitePolicy {
  pricePerKwh: number;
  connectionFee: number;
  powerPolicy: PowerPolicy;
  maintenanceLevel: MaintenanceLevel;       // NEW (C4)
  partialChargeTargetSoc?: number;          // CORE (D14); fraction 0–1, undefined = off
  // AMENDED (C5): the discussion's dashboard implied a `dynamicPricingEnabled` flag.
  // It has no defined mechanic and is NOT in the model. Do not add without one.
  // AMENDED (readiness review, C5 applied to our own fields):
  //   `targetMaxWaitSeconds` removed — no mechanic read it and no action set it.
  //   `baysOpenByDefault` removed — a third representation of open-ness alongside
  //   Site.openBayIds and ChargerBay.isOpen. ChargerBay.isOpen is canonical;
  //   Site.openBayIds is a derived convenience list kept in sync by the reducer.
}
```

### 5.3 Economics and metrics

```ts
export interface SiteEconomics {
  cash: number;
  revenueToday: number;
  energyCostToday: number;
  maintenanceCostToday: number;
  opexAccruedToday: number;   // NEW (readiness review): invariant 6 reconciles
                              // Δcash against revenue − energy − maintenance − opex − capex,
                              // and opex had no accumulator to reconcile against.
  capexSpentToday: number;
  // AMENDED: `refundsToday` REMOVED. There is no refund mechanic, action or event
  // anywhere in the model; it appeared in neither the margin formula nor invariant 6,
  // so any nonzero value would have silently broken cash reconciliation. Restore it
  // only alongside a defined refund rule (C5).
}

// NEW (readiness review): the demand-funnel counters. The KPI dictionary's funnel
// identity and every rate below need these; none of them existed. Exactly one
// counter increments per vehicle terminal state, which is what invariant 7 checks.
export interface DemandFunnel {
  arrived: number;
  rejectedSite: number;
  siteFull: number;
  queueJoined: number;
  abandonedQueue: number;
  sessionsStarted: number;
  interruptedByFault: number;
  completed: number;
  closedAtRunEnd: number;
}

export interface SiteMetrics {
  trust: number;                 // 0–100. Canonical name is `trust` everywhere (C6)
  uptimePct: number;             // 0–100
  utilizationPct: number;
  powerUtilizationPct: number;   // NEW: defined in the KPI dictionary, had no field
  avgWaitSeconds: number;
  queueLength: number;
  abandonmentRatePct: number;
  sessionsCompleted: number;
  // REMOVED: sessionsAbandoned. It was a second copy of funnel.abandonedQueue,
  // incremented on the adjacent line, and its only reader was a post-run caption
  // that said nothing. §6.5: no field without a reader.
  kwhDelivered: number;
  throughputVehiclesPerHour: number;

  // AMENDED (O2): definitions now match the KPI dictionary exactly, which is
  // canonical for meaning. The old inline comments disagreed with it —
  // "started / (assigned to a bay)" is degenerate (nothing can fail between
  // assignment and start), and session success excludes faulted sessions.
  sessionSuccessRatePct: number;      // completedWithoutFault / sessionsStarted
  chargeStartSuccessRatePct: number;  // sessionsStarted / (accepted − closedAtRunEnd)

  downtimeFaultSeconds: number;       // NEW (O3): uptime decomposition —
  downtimeRepairSeconds: number;      // fault-wait vs active-repair vs
  downtimeClosedSeconds: number;      // closed-by-player bay-time

  // NEW (readiness review): accumulators the KPI formulas need and didn't have.
  openBaySeconds: number;             // uptime + utilization denominator
  occupiedBaySeconds: number;         // utilization numerator (charging OR allocated)
  trustDeltaThisHour: number;         // backs the ±5-per-sim-hour clamp; rolling 3,600s
  funnel: DemandFunnel;

  failureStatesActive: FailureState[];    // NEW (D24)
  failureStatesObserved: FailureState[];  // NEW (D24): sticky, feeds gate criterion 3
}

export interface Site {
  id: Id;
  name: string;
  maxBays: number;
  openBayIds: Id[];              // derived from ChargerBay.isOpen; reducer keeps it in sync
  gridPowerKw: number;
  availablePowerKw: number;
  policy: SitePolicy;
  economics: SiteEconomics;
  metrics: SiteMetrics;
  // AMENDED (D23): `reservePowerKw` REMOVED. Nothing defined what reserving power did;
  // with a flat energy price (A10) and a full rebalance every tick it bought nothing.
  // It returns only with a time-of-use or demand-charge mechanic (Phase 5).
}
```

### 5.4 Chargers and vehicles

```ts
export interface ChargerSpec {              // VERBATIM
  type: ChargerType;
  maxPowerKw: number;
  reliabilityBase: number;                  // 0–1
  repairSecondsMean: number;
}

export interface ChargerBay {
  id: Id;
  siteId: Id;
  label: string;
  spec: ChargerSpec;
  state: ChargerState;
  isOpen: boolean;                          // canonical open-ness (see SitePolicy note)
  allocatedPowerKw: number;
  currentVehicleId?: Id;
  activeSessionId?: Id;
  faultedAtSecond?: SimSeconds;             // AMENDED (C11): was faultedAtMs (UnixMs)
  repairScheduledAtSecond?: SimSeconds;     // NEW (D19/§4.4): when the player called it in
  repairDueAtSecond?: SimSeconds;           // AMENDED (C11)

  // NEW (D19): latched transitions. Set when the player acts on a busy bay; applied by
  // applyPendingBayTransitions() when the bay next reaches `idle`. A latched bay accepts
  // no new assignments from the tick the action lands.
  closeRequested: boolean;
  pendingUpgradeType?: ChargerType;

  lifetimeSessions: number;
  lifetimeKwh: number;
}

export interface VehicleDemand {            // SOC values are fractions 0–1 (C6)
  targetSoc: number;
  requestedKwh: number;
  maxAcceptablePricePerKwh: number;         // hard rejection, on top of siteScore
  patienceSeconds: number;
  // AMENDED (readiness review, C5): `minRequiredSoc` and `maxAcceptableWaitSeconds`
  // removed — neither was read by any formula and neither had a calibrated value.
  // Wait tolerance is expressed by patienceSeconds (queueing) and waitSensitivity
  // (admission); a second wait threshold was a spare part.
}

export interface VehicleAgent {
  id: Id;
  archetype: VehicleArchetype;
  state: VehicleState;
  batteryCapacityKwh: number;
  maxChargeRateKw: number;                  // NEW (D15): vehicle-side power cap
  currentSoc: number;                       // fraction 0–1 (C6)
  arrivalSecond: SimSeconds;
  urgencyScore: number;                     // 0–1
  priceSensitivity: number;                 // 0–1
  waitSensitivity: number;                  // 0–1
  demand: VehicleDemand;
  expectedWaitSeconds?: number;
  queuedAtSecond?: SimSeconds;              // AMENDED (C11): all *AtMs → *AtSecond
  chargingStartedAtSecond?: SimSeconds;
  leftAtSecond?: SimSeconds;
  leaveReason?: QueueLeaveReason;
}
```

### 5.5 Queue and sessions

```ts
export interface QueueEntry {               // AMENDED (C11): queuedAtMs → queuedAtSecond
  vehicleId: Id;
  queuedAtSecond: SimSeconds;
  predictedWaitSeconds: number;
  preferredChargerTypes: ChargerType[];
}

export interface ChargingSession {          // AMENDED (C11): timestamps → SimSeconds
  id: Id;
  siteId: Id;
  vehicleId: Id;
  chargerBayId: Id;
  startedAtSecond: SimSeconds;
  updatedAtSecond: SimSeconds;
  endedAtSecond?: SimSeconds;
  requestedKwh: number;
  deliveredKwh: number;
  targetSoc: number;                        // fraction 0–1
  effectivePowerKw: number;
  pricePerKwh: number;
  connectionFee: number;
  estimatedDurationSeconds: number;
  actualDurationSeconds?: number;
  completed: boolean;
  interruptedByFault: boolean;
}
```

### 5.6 Player actions — `AMENDED (C4, C5)`

```ts
export interface PlayerActionBase {
  id: Id;
  tick: number;
  atSecond: SimSeconds;                     // AMENDED (C11): was atMs
  type: PlayerActionType;
}

export interface SetPriceAction extends PlayerActionBase {
  type: "set_price";
  pricePerKwh: number;
  connectionFee?: number;
}

export interface SetPowerPolicyAction extends PlayerActionBase {
  type: "set_power_policy";
  powerPolicy: PowerPolicy;
  manualAllocationsKw?: Record<Id, number>; // required when powerPolicy === "manual"
  // AMENDED (D23): `reservePowerKw` removed — see the Site note in §5.3.
}

export interface ToggleBayGroupAction extends PlayerActionBase {
  type: "toggle_bay_group";
  bayIds: Id[];
  open: boolean;
  // D19: `open: false` on a busy bay latches (closeRequested) rather than applying;
  // `open: true` applies immediately. The reducer never terminates a session to
  // satisfy a close request.
}

export interface ScheduleRepairAction extends PlayerActionBase {
  type: "schedule_repair";
  chargerBayId: Id;
}

export interface SetMaintenanceLevelAction extends PlayerActionBase { // NEW (C4)
  type: "set_maintenance_level";
  level: MaintenanceLevel;
}

export interface UpgradeChargerAction extends PlayerActionBase {
  type: "upgrade_charger";
  chargerBayId: Id;
  newType: ChargerType;
  // AMENDED (D20): `capexCost` REMOVED. An action that carries its own price lets a
  // hand-edited replay log mint money — unacceptable in a core whose entire claim is
  // determinism. Cost is resolved from scenario.upgradeCosts at reduce time.
  // D19: capex is debited on THIS tick; the spec swap lands when the bay next idles.
}

export interface SetPartialChargeTargetAction extends PlayerActionBase { // CORE (D14)
  type: "set_partial_charge_target";
  targetSoc: number | null;                 // fraction 0–1; null = turn policy off.
  // Actions are JSON-serialisable, so "off" travels as null; the reducer maps
  // null -> undefined on SitePolicy.partialChargeTargetSoc (one canonical off-state).
}

export type PlayerAction =
  | SetPriceAction
  | SetPowerPolicyAction
  | ToggleBayGroupAction
  | ScheduleRepairAction
  | SetMaintenanceLevelAction
  | UpgradeChargerAction
  | SetPartialChargeTargetAction;           // CORE (D14)
```

### 5.7 Scenario and root state — `AMENDED (C10, C11, D20, D26)`

v1.3's `ScenarioConfig` could not express `roadsideHub.ts`: no bay roster, no initial trust, fee, power policy or maintenance level, no scripted-fault schedule, no upgrade prices, no queue capacity, and fail conditions that lived only in scenario prose. D20 completes it.

```ts
export interface ScenarioGoals {            // AMENDED (D10): minCash → minOperatingMargin.
  minTrust: number;                         // With a realistic £50k float, a cash floor
  minOperatingMargin: number;               // measures nothing; margin (capex-excluded,
  maxAvgWaitSeconds: number;                // per D12) is the scored economic goal.
  minSessionsCompleted: number;
}

// REMOVED (D41). D20 lifted the hard fail rules out of prose into this type;
// D41 removed the rules themselves. Bankruptcy never fired — D37 refuses
// unaffordable upgrades, so nothing can spend past zero — and trust collapse
// shut the site around 20:00 on a day the player had already lost. Both are now
// scored at close-out instead. Kept here as a note because the shape of the
// state is otherwise hard to date.
// export interface FailRules { ... }

export interface BayRosterEntry {           // NEW (D20)
  id: Id;
  label: string;
  type: ChargerType;
}

export interface ScriptedFault {            // NEW (D20)
  atSecond: SimSeconds;
  bayId: Id;                                // explicit — see the D20 note below
  category: FaultCategory;
}

export interface UpgradeCost {              // NEW (D20): replaces the self-priced action
  from: ChargerType;
  to: ChargerType;
  capexCost: number;
}

export interface ScenarioConfig {
  id: Id;
  name: string;
  archetype: "corridor_hub" | "commuter_hub" | "destination_site"; // NEW (O6)
  durationSeconds: number;
  tickSeconds: number;                      // NEW (D26): 60. The ONLY source of deltaSeconds.
  demandWaves: DemandWave[];
  referencePricePerKwh: number;             // NEW (D21): elasticity pivot (£0.79)

  bays: BayRosterEntry[];                   // NEW (D20): the 4×rapid / 2×ultra roster
  initialGridPowerKw: number;
  maxQueueLength: number;                   // NEW (D20): makes "site_full" reachable

  initialCash: number;
  initialPricePerKwh: number;
  initialConnectionFee: number;             // NEW (D20)
  initialTrust: number;                     // NEW (D20): 60
  initialPowerPolicy: PowerPolicy;          // NEW (D20)
  initialMaintenanceLevel: MaintenanceLevel;// NEW (D20)
  initialPartialChargeTargetSoc?: number;   // NEW (D20): undefined = off

  energyCostPerKwh: number;                 // NEW (C10): margin was uncomputable without it
  opexPerSimDay: number;                    // NEW (C10): fixed site opex (rent etc.)
  upgradeCosts: UpgradeCost[];              // NEW (D20)

  scriptedFaults: ScriptedFault[];          // NEW (D20): the 12:30 beat was unrepresentable
  goals: ScenarioGoals;
  // failRules removed (D41) — was NEW (D20)
}
```

**D20 note on `ScriptedFault.bayId`.** The scenario spec called for "the busier ultra bay, tiebreak bay 5" and then claimed the fault was seed-independent. It isn't — "busier" varies by seed. The *timing* is what needs to be seed-independent (it's a designed story beat), so the target is now a fixed `bayId`, chosen by the scenario author.

```ts
export interface SimulationState {
  clock: GameClock;
  scenario: ScenarioConfig;
  rngState: string;                         // mulberry32 uint32 as 8 hex chars (D26)
  site: Site;
  chargers: Record<Id, ChargerBay>;
  vehicles: Record<Id, VehicleAgent>;
  queue: QueueEntry[];
  sessions: Record<Id, ChargingSession>;
  activeSessionIds: Id[];
  completedSessionIds: Id[];
  departedVehicleIds: Id[];
  pendingActions: PlayerAction[];
  eventLog: SimEvent[];                     // in-memory ring; full log via logger (§7)
  paused: boolean;
  result?: "success" | "fail";
}
```

### 5.8 Derived selectors — `VERBATIM`

Derived each tick, never stored:

```ts
export interface DerivedSiteState {
  occupiedBayCount: number;
  idleBayCount: number;
  faultedBayCount: number;
  totalOpenBayCount: number;
  totalAllocatedPowerKw: number;
  sparePowerKw: number;
  projectedWaitSeconds: number;
}
```

Selectors: `getCompatibleIdleBays(vehicle, chargers)`, `getProjectedWait(queue, chargers, site)`, `getDemandMultiplier(clock, demandWaves)`, `getTrustDelta(lastTickEvents, metrics)`, `getFailState(simState)`.

---

## 6. First-pass formulas — `AMENDED (C10, D21)`

Deliberately simple and legible; constants come from the calibration sheet (C9).

```pseudo
effectiveTargetSoc       = min(driverTargetSoc, sitePartialChargeTargetSoc ?? 1)   // D14
requestedKwh             = (effectiveTargetSoc - currentSoc) * batteryCapacityKwh
effectivePowerKw         = min(bayAllocatedKw, vehicle.maxChargeRateKw)            // D15
                           * taper(currentSoc)     // 1.0 below 0.80 SOC, 0.4 at/above (D14);
                                                   // a session targeting 0.80 never enters the taper zone
estimatedDurationSeconds = requestedKwh / effectivePowerKw * 3600

// AMENDED (D21). v1.3 had `arrivalRate = baseDemand * waveMultiplier * priceElasticity(price)`
// with no `baseDemand` defined anywhere, while the wave table gives ABSOLUTE rates —
// and the calibration sheet hard-coded an elasticity of 1.2 next to a per-wave
// priceElasticity of 0.7–1.2. One formula now, and the wave value IS the coefficient:
priceMultiplier          = clamp(1 - wave.priceElasticity
                                   * (price - scenario.referencePricePerKwh)
                                   / scenario.referencePricePerKwh,
                                 0.3, 1.5)
arrivalRatePerMinute     = wave.arrivalRatePerMinute * priceMultiplier

// AMENDED (D21). priceSensitivity and waitSensitivity were calibrated per archetype
// and then read by nothing — the old formula used flat global coefficients instead.
// They are now the whole point of the formula: archetypes differ on admission.
siteScore                = a * urgencyScore
                           - b * waitSensitivity  * (expectedWaitSeconds / 600)
                           - c * priceSensitivity * ((price - archetypeReferencePrice) / 0.10)
                           + d * ((trust - 50) / 25)
accepted                 = siteScore >= ACCEPT_THRESHOLD
                           AND price <= demand.maxAcceptablePricePerKwh   // hard reject

abandonProbability       = 0 while waited < patienceSeconds; then ramps (Calibration §5)

sessionRevenue           = deliveredKwh * pricePerKwh + connectionFee
sessionEnergyCost        = deliveredKwh * scenario.energyCostPerKwh        // AMENDED (C10)
margin                   = revenue - energyCost - maintenanceCost
                           - (opexPerSimDay * simDayFraction)              // AMENDED (C10)

trustDelta               = + completionBonus + shortWaitBonus + uptimeBonus
                           - abandonPenalty - faultPenalty - rejectPenalty
                           - partialChargePenalty                          // D14
                         clamped to ±5 over a rolling 3,600 sim-second window
```

### 6.1 Power allocation policies — `NEW (D23)`

`queue_relief` appeared in the policy union, the action, the panel and the sanity-gradient table without an algorithm anywhere. All four are now specified. In every case the pool is `site.gridPowerKw`, and each bay's ceiling is `min(bay.spec.maxPowerKw, vehicle.maxChargeRateKw) × taper(soc)` — a bay is never allocated power its vehicle cannot accept.

| Policy | Allocation |
| :-- | :-- |
| `equal_share` | Pool split equally across charging bays, each clamped to its ceiling. Power freed by clamping is redistributed to unclamped bays; repeat until stable or the pool is spent. |
| `fast_first` | Bays sorted by `spec.maxPowerKw` descending (tiebreak: bay id). Each takes its full ceiling until the pool is exhausted; the marginal bay takes the remainder; the rest get 0 kW and idle at the plug. |
| `queue_relief` | Bays sorted by **estimated remaining seconds to completion, ascending** (tiebreak: bay id) — shortest-job-first. Each takes its full ceiling until the pool is exhausted. Finishes sessions soonest, so bays return to the queue fastest. This is genuinely distinct from `fast_first`: a nearly-done car on a slow bay outranks a just-plugged car on an ultra. |
| `manual` | Per-bay kW from `manualAllocationsKw`, each clamped to its ceiling; unlisted bays get 0. If the requested total exceeds the pool, allocations are scaled down proportionally — the reducer never exceeds the cap to honour a player request. |

Under a binding cap none of these creates kilowatts; they choose who waits. That is the intended lesson, and it is why partial-charge (D14) is the only ceiling-raising lever.

---

## 7. Logging and replay — `AMENDED (C6, C11)`

**Jobs (Part O, verbatim):** replay a run · debug weird outcomes · compute KPIs · compare runs/policies. Format: typed arrays in memory, **NDJSON** on export. Snapshot cadence: every 300 sim-seconds (5 sim-minutes) — `AMENDED (D9)`: the discussion's "every 5 sim-seconds" predates the time-scale decision (288× per D8, Calibration §1) and would emit ~58 snapshots per real second.

### 7.1 Base event

```ts
export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogEntityType =
  "run" | "scenario" | "site" | "vehicle" | "queue" | "charger" | "session" | "player" | "metric";

// AMENDED (C6): removed events for unmodelled systems —
//   "session.payment_failed", "charger.unreachable", "vehicle.queue_timeout".
// NEW (C4): added maintenance-level and upgrade events to keep the
//   action union and event catalogue a matched pair.
export type LogEventName =
  | "run.started" | "run.completed" | "run.failed"
  | "scenario.loaded"
  | "vehicle.arrived" | "vehicle.site_accepted" | "vehicle.site_rejected"
  | "vehicle.queue_joined" | "vehicle.queue_abandoned"
  | "vehicle.departed"                        // NEW (readiness review): the terminal event.
                                              // D18's `scenario_end` and D19's
                                              // `service_interrupted` had no event to
                                              // travel on; the funnel could not be
                                              // reconstructed from the log alone.
  | "session.started" | "session.completed" | "session.interrupted"
  | "charger.fault_detected"
  | "charger.repair_scheduled"                // NEW (readiness review): pairs with the
                                              // `schedule_repair` action. Without it
                                              // invariant 8 fails on its own action set —
                                              // repair_started is a sim event, not the
                                              // player's decision marker.
  | "charger.repair_started" | "charger.repair_completed"
  | "charger.upgraded"                        // NEW (C4)
  | "site.price_updated" | "site.power_policy_updated" | "site.bay_group_toggled"
  | "site.maintenance_level_updated"          // NEW (C4)
  | "site.partial_charge_policy_updated"      // CORE (D14)
  | "metric.snapshot"
  | "failure_state.entered" | "failure_state.cleared"   // NEW (D24)
  | "alert.raised" | "alert.cleared";

export interface BaseLogEvent {
  log_schema_version: 1;
  // AMENDED (C11): `timestamp_utc` REMOVED from events — wall-clock time exists
  // only in the RunManifest. Events are ordered by sim time + tick.
  sim_time_seconds: number;
  tick_index: number;
  level: LogLevel;
  event_name: LogEventName;
  message: string;
  service: "chargepoint-operator-mvp";
  environment: "dev" | "test" | "prod";
  app_version: string;
  run_id: string;
  scenario_id: string;
  seed: string;                 // AMENDED (D26): was `number`, but the playtest seeds are
                                // `pt-1`/`pt-2`/`pt-3`. Strings everywhere.
  entity_type?: LogEntityType;
  entity_id?: string;
  parent_entity_type?: LogEntityType;
  parent_entity_id?: string;
  correlation_id?: string;
  causation_id?: string;
  tags?: string[];
  data?: Record<string, string | number | boolean | null>;
}
```

### 7.2 Run manifest — `AMENDED (C11 note)`

```ts
export interface RunManifest {
  run_id: string;
  scenario_id: string;
  seed: string;                             // AMENDED (D26): string, not number
  app_version: string;
  started_at_utc: string;     // wall-clock lives HERE and only here (C11)
  completed_at_utc?: string;
  outcome?: "success" | "fail" | "aborted";
  duration_sim_seconds?: number;
  tick_count?: number;
  initial_state_hash: string;               // FNV-1a over canonical JSON (D26)
  final_state_hash: string | undefined;     // same seed + actions ⇒ same hash (D4)
  policy_label?: "baseline" | "played" | "tester-run";  // NEW (O4); "tester-run" per
                                                        // playtest protocol §1
  failure_states_observed?: FailureState[]; // NEW (D24): makes gate criterion 3 a count
                                            // over manifests, not a judgement call
  goals_met?: Record<string, boolean>;      // NEW: per-goal outcome, for compareRuns
  notes?: string;
}

export interface RunLogBundle {
  manifest: RunManifest;
  events: SimulationLogEvent[];
}
```

### 7.3 Specialised events — amendments to the discussion's versions

The discussion's discriminated-union event interfaces (`VehicleArrivedEvent`, `SessionStartedEvent`, fault/repair events, player-action events with before/after values, `MetricSnapshotEvent`, alert events) are adopted **as written**, with these corrections applied across all of them:

- **`AMENDED (C6, then again by the readiness review)`** — C6 claimed to have aligned abandonment reasons "to the modelled ones", but left the logs emitting `"patience_exceeded" | "price_reject"` while the sim's `QueueLeaveReason` used `reject_site | queue_abandon | …`. Two vocabularies for one concept, zero overlap — exactly the drift the paired-schema rule exists to prevent. **There is now one vocabulary: `QueueLeaveReason` (§5.1).** The `vehicle.departed` event carries `leave_reason` with those values; the `abandonment_reason` field is deleted. `fault_category` is the `FaultCategory` type in §5.1 (no `"payment_fault"` — no payment system). `trust_score` renamed `trust` — one canonical name (the `_pct`/unit-suffix convention still applies to unit-bearing fields).
- **`AMENDED (C6)` units rule** — sim stores fractions (0–1); logs emit `*_pct` (0–100); conversion happens **only** at the log boundary. Field names carry units: `avg_wait_seconds`, `allocated_power_kw`, `revenue_amount`.
- **`AMENDED (C11)`** — no per-event wall-clock timestamps.
- **`NEW (O2, O3)`** — `metric.snapshot.data` adds `session_success_rate_pct`, `charge_start_success_rate_pct`, `downtime_fault_seconds`, `downtime_repair_seconds`, `downtime_closed_seconds`. (The discussion's snapshot already had `session_success_rate_pct` in the logs but not in the sim model — the model now matches, per §5.3.)
- **Conventions kept `VERBATIM`** — snake_case keys, `log_schema_version` from day one, stable low-cardinality `domain.action` names, decision markers logging full before/after values for every player action, no sensitive data.

### 7.4 Logger API — `VERBATIM`

```ts
export interface SimulationLogger {
  append(event: SimulationLogEvent): void;
  appendMany(events: SimulationLogEvent[]): void;
  getEvents(): readonly SimulationLogEvent[];
  clear(): void;
  exportNdjson(): string;
  exportJson(): RunLogBundle;
}
```

**MVP catalogue cut — `AMENDED (D24, D25)`:** player actions, vehicle lifecycle (arrival → departure), queue/session events, fault/repair events, metric snapshots (every 5 sim-min — D9), run start/end, **failure-state transitions (D24)** and **alerts (D25 — `AlertsFeed` is now in the MVP cut, so its events must be too)**. Everything else waits.

---

## 8. Dashboard architecture — `AMENDED (C4, C5, D25)`

### 8.1 Layout — `AMENDED (D25)`

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ TOP BAR: scenario | time | speed | pause | success/fail | alerts summary     │
├──────────────────────────────────────────────────────────────────────────────┤
│ KPI STRIP: cash | trust | uptime | utilization | avg wait | ABANDONMENT      │
│            | queue | margin                                                  │
├───────────────┬────────────────────────────────────────────┬─────────────────┤
│ LEFT RAIL     │ MAIN CENTER                                │ RIGHT RAIL      │
│ Controls      │ Trends / diagnostics / goal progress       │ Queue / faults  │
├───────────────┴────────────────────────────────────────────┴─────────────────┤
│ BOTTOM: event log | action history | scenario timeline                       │
└──────────────────────────────────────────────────────────────────────────────┘
```

**`AMENDED (D25)`** — the strip gains an **abandonment card, rendered immediately after avg wait**. The KPI dictionary makes that adjacency a *binding* rule (avg wait can improve purely because the impatient left), and the v1.3 strip had no abandonment card at all, so the rule was unsatisfiable by the layout it governed.

### 8.2 MVP component cut — `AMENDED (C4, D25)`

**Fifteen** components. The 11-component cut from the discussion, plus `BayAvailabilityPanel` (C4 — `toggle_bay_group` is a core action), `ChargingPolicyPanel` (D14 — partial-charge is now core), and **`DiagnosisPanel` + `AlertsFeed` (D25)**.

> **Why D25 promoted two more.** C2 transferred the entire legibility burden to `DiagnosisPanel`, `ActiveQueueTable`, `BayStatusMatrix`, `AlertsFeed` and the event log — and then three of those five sat outside the cut, while Phase 2's exit criterion demanded every failure state be diagnosable *from the dashboard alone*. Phase 2 could not have passed its own gate. `DiagnosisPanel` and `AlertsFeed` are promoted (their thresholds and events were already fully specified in the KPI dictionary, so they cost design nothing). `BayStatusMatrix` stays second-wave: `BayAvailabilityPanel` and `FaultsAndRepairsPanel` between them already show per-bay state, tier, open-ness, fault and repair status. **C2's panel list is amended to match.**

`ScenarioHeader` · `RunControls` · `KpiCardGrid` · `PricingControlPanel` · `PowerPolicyPanel` · `MaintenancePanel` · `BayAvailabilityPanel` · `ChargingPolicyPanel` · `ActiveQueueTable` · `FaultsAndRepairsPanel` · `DiagnosisPanel` · `AlertsFeed` · `WaitTimeTrendChart` · `EconomicsTrendChart` · `EventLogPanel`

Second wave (8): `BayStatusMatrix`, `PowerLoadChart`, `ActiveSessionsTable`, `ScenarioGoalsPanel`, `ScenarioTimeline`, `ActionHistoryPanel`, `UtilizationAndUptimeChart`, `AlertSummary`. (15 + 8 = the original 23.)

### 8.3 Component–state mapping (MVP cut) — `AMENDED (C4, C5)`

Writes column now names **only actions that exist in the §5.6 union** — the C6 paired-schema rule applied to the UI:

| Component | Primary reads | Writes (actions) |
| :-- | :-- | :-- |
| `ScenarioHeader` | `scenario`, `clock`, `result` | — |
| `RunControls` | `paused`, sim speed (UI state) | sim control (pause/speed/restart/export — UI-level, not sim actions) |
| `KpiCardGrid` | `site.metrics`, `site.economics` | — · **avg-wait and abandonment cards adjacent — binding (KPI dict)** |
| `PricingControlPanel` | `site.policy` | `set_price` *(dynamic-pricing toggle removed — C5)* |
| `PowerPolicyPanel` | `site.policy`, `chargers`, derived power | `set_power_policy` (incl. manual kW map) *(reserve control removed — D23)* |
| `MaintenancePanel` | `chargers`, uptime + downtime decomposition | `set_maintenance_level` *(repair moved to one home — see note)* |
| `BayAvailabilityPanel` | `chargers` (`isOpen`, `closeRequested`, `pendingUpgradeType`) | `toggle_bay_group`, `upgrade_charger` *(upgrade needs a home; this is it — C4)*. **Must surface latched close/upgrade as "pending — applies when bay frees" (D19)** |
| `ChargingPolicyPanel` | `site.policy.partialChargeTargetSoc` | `set_partial_charge_target` *(D14; admission-policy and low-SOC-priority controls remain cut per C5)* |
| `ActiveQueueTable` | `queue`, `vehicles` | — |
| `FaultsAndRepairsPanel` | charger fault/repair fields, MTTR | `schedule_repair` *(sole owner)* |
| `DiagnosisPanel` *(D25)* | `metrics.failureStatesActive`, funnel, snapshot history | — |
| `AlertsFeed` *(D25)* | active alerts (KPI dict thresholds) | — |
| `WaitTimeTrendChart` | metric snapshot history | — |
| `EconomicsTrendChart` | economics history | — |
| `EventLogPanel` | `eventLog` | — |

**Repair control ownership — `NEW` (readiness review):** v1.3 had both `MaintenancePanel` and `FaultsAndRepairsPanel` emitting `schedule_repair`. Two controls for one action is a legibility bug in a build whose gate criterion is legibility, and it makes "what did you change?" unanswerable from the action history. **`FaultsAndRepairsPanel` owns `schedule_repair`**; `MaintenancePanel` owns the standing policy (`set_maintenance_level`) and displays the uptime/downtime decomposition.

**Shared UI rules (Part M, verbatim):** every KPI card shows value + delta + hover explanation; every control shows its last-applied time; status colours green/amber/red/blue. **Explainability rule (C2, binding):** the dashboard must let the player answer *what is happening, why, and what can I change* — every failure state diagnosable from panels alone. That's the whole reason there's no picture of the site; the dashboard *is* the site. DON'T PANIC belongs in large friendly letters on the `AlertsFeed` — which, as of D25, actually ships in the MVP, so there's no excuse now.

---

## 9. Verification & validation harness — `AMENDED` (expanded from Part P)

### 9.1 Invariants (`validation/invariants.ts`) — checked every tick

From Part P, plus schema-consistency checks added by this review:

1. `queue.length >= 0` and `≤ scenario.maxQueueLength`; no vehicle appears twice in the queue.
2. `Σ allocatedPowerKw ≤ site.gridPowerKw` at all times. *(`AMENDED (D23)`: the reserve term is gone with `reservePowerKw`.)* Additionally, per bay, `allocatedPowerKw ≤ min(spec.maxPowerKw, vehicle.maxChargeRateKw)` — never allocate power the vehicle cannot take.
3. `deliveredKwh ≤ requestedKwh` per session.
4. **`AMENDED (D19)`** — a bay in `faulted` or `repairing`, or with `isOpen == false`, never has an active charging session. This held only after D19 fixed the ordering: a fault **detaches and finalizes the session before** setting the bay to `faulted`, and a close request on a busy bay **latches** rather than applying. As previously written, this invariant fired on every single fault.
5. SOC stays within 0–1; `currentSoc` never decreases during charging.
6. Cash reconciliation: `Δcash = revenue − energyCost − maintenance − opex − capex` per tick, checked against the `SiteEconomics` accumulators. *(Needs the `opexAccruedToday` field added in §5.3, and holds only because `refundsToday` — a field with no mechanic behind it — was removed.)*
7. Every vehicle terminates in `complete` or `left` by scenario end, after the end-of-run close-out sweep (D18/D19). Every terminal vehicle has exactly one `leaveReason`, and the `DemandFunnel` counters sum to `funnel.arrived`. No orphans. *(D19's `service_interrupted` is what makes this reachable for fault-interrupted vehicles, which previously had no legal terminal state.)*
8. **`AMENDED`** — every `PlayerActionType` has exactly one corresponding decision-marker log event, and vice versa (C6 paired-schema rule, enforced by a test). The mapping is fixed:

   | Action | Event |
   | :-- | :-- |
   | `set_price` | `site.price_updated` |
   | `set_power_policy` | `site.power_policy_updated` |
   | `toggle_bay_group` | `site.bay_group_toggled` |
   | `schedule_repair` | `charger.repair_scheduled` |
   | `set_maintenance_level` | `site.maintenance_level_updated` |
   | `upgrade_charger` | `charger.upgraded` |
   | `set_partial_charge_target` | `site.partial_charge_policy_updated` |

   *(`schedule_repair` previously had no partner — `charger.repair_started` is a sim consequence, not the player's decision marker — so the test would have failed on day one. `charger.repair_scheduled` was added for this.)*
9. `NEW` — same seed + same action stream ⇒ same `final_state_hash` (D4/C11/D26, enforced by a test). Run the roadside hub twice from the same seed and diff the hash; also assert `rngState` matches at every snapshot boundary, so a divergence is localised to a tick range instead of just "somewhere in 1,440 ticks".

### 9.2 Trace mode & replay

Single-step execution with full per-tick state diff output (Part P); replay = re-run reducer from `RunManifest.seed` + logged action stream. Both live in `validation/` + `logging/` and are Phase 1 deliverables, not afterthoughts.

### 9.3 Calibration & sensitivity hooks

`headless.ts` accepts a scenario + policy script + seed batch, so the Phase 0 calibration sheet (C9) can be checked against actual output ranges in Phase 1, and Phase 3's sensitivity sweeps (arrival rate, price elasticity, fault rate, patience — outputs must move in sane directions) are just batch runs over parameter grids.

---

## 10. Change control & amendment log

**The paired-schema rule (C6):** these four artifacts change together or not at all — §5.6 `PlayerAction` union · §7.1 `LogEventName` catalogue · §8.3 component writes column · the sim systems that consume them. Invariant 8 makes drift a test failure rather than a code-review hope.

**Amendment traceability** — every deviation from the discussion, by plan item:

| Plan item | Applied in |
| :-- | :-- |
| C2 (no visuals; legibility → dashboard) | §2.1, §3, §8.3 explainability rule |
| C4 (canonical action set) | §5.1, §5.6, §7.1, §8.2, §8.3 |
| C5 (no control without a mechanic) | §5.2, §5.6 (stretch flags), §8.3 |
| C6 (log/sim alignment; units; naming) | §7.1, §7.3, §9.1-inv.8 |
| C8 (continuous control) | §4.1, §4.2, §4.3 |
| C10 (energy cost + opex) | §5.7, §6 |
| C11 (no wall-clock in sim) | §5.1, §5.2, §5.4, §5.5, §7.1, §7.2 |
| O2/O3 (session success; downtime split) | §5.3, §7.3 |
| O4 (baseline mode) | §3 `experiment/`, §7.2 `policy_label` |
| O6 (scenario archetypes) | §3, §5.7 |
| O7 (V&V harness) | §3, §4.1, §9 |
| D19 (interruption & deferred bay transitions) | §4.1, §4.2, §4.3, §5.1, §5.4, §5.6, §8.3, §9.1-inv.4/7 |
| D20 (`ScenarioConfig` completed) | §5.7, §5.6 (`capexCost` removed) |
| D21 (one demand formula, sensitivities read) | §4.3, §6 |
| D22 (baseline pinned, incl. repairs) | §4.4, §3 `experiment/` |
| D23 (power policies defined, reserve cut) | §5.3, §5.6, §6.1, §9.1-inv.2 |
| D24 (failure states defined) | §4.1, §5.1, §5.3, §7.1, §7.2, §8.3 |
| D25 (15-component cut) | §8.1, §8.2, §8.3, §7 catalogue cut |
| D26 (determinism contract) | §2.3, §5.7, §7.1, §7.2 |
| Readiness review (opex/refunds, repair rules, repair-control ownership, event pairs, orphan fields) | §2, §4.4, §5.2, §5.3, §5.4, §7.1, §7.3, §8.3, §9.1-inv.6/8 |

**Phase 0 companions:** first-guess values for every named constant (`ACCEPT_THRESHOLD`, trust deltas, elasticities, fault rates, goal thresholds) and the A1–A12 assumptions register live in `ChargePointOperator_Calibration.md`. This document intentionally contains no tuning numbers — they're design inputs, not architecture.

