# ChargePointOperator — Consolidated Design & Delivery Plan

**Version:** 1.8 · **Date:** 2026-08-16 *(v1.1: D5 wave-timing aligned · v1.2: ratification updates · v1.3: final-review fixes · v1.4: readiness-review fixes — C2 panel list vs the MVP cut, O4 baseline maintenance level, phase exit criteria, Phase 0 status · **v1.5: Phase 1 complete — status, findings, OPEN-3 closed, OPEN-4 to OPEN-7 raised · v1.6: OPEN-4 and OPEN-5 closed by D30/D31; Phase 2 exit now fully met**)*
**Source:** `original_perplexity_discussion.md` (22-turn research discussion)
**Purpose:** Decompose the source discussion into its component parts, reconcile them against each other, resolve errors/omissions/contradictions, and produce a single well-formed plan with a defined outcome and a process to reach it. This document is the deliverable — no code, no build.

---

## 1. How this document was produced

The source discussion is a research conversation that wandered (productively) through several dead ends before converging. That means it contains superseded advice sitting next to current advice, specs written for abandoned approaches, and later refinements that were never folded back into earlier specs. The method here was: (1) label every component part and mark its status, (2) cross-check each adopted part against every other adopted part, (3) resolve each conflict with an explicit decision, and (4) reassemble the survivors into one coherent plan with a decision gate at the end.

---

## 2. Component breakdown of the source discussion

Each part is labelled with what it *is* and its **status**: `ADOPTED` (part of the plan, possibly amended), `SUPERSEDED` (explicitly replaced by a later decision), or `REFERENCE` (background/inspiration only, not a plan input).

| Part | Turns | Content | Status |
| :-- | :-- | :-- | :-- |
| **A. OSS game landscape survey** | 1–2 | OpenTTD, Mindustry, Freeciv etc.; OpenTTD deep dive | `REFERENCE` |
| **B. Original game concept** | 3 | "You run a Charge Point Operator" — six-layer system stack (map / demand / station / grid / business / reputation), feature ideas, first MVP sketch | `ADOPTED` (concept & layers) / `SUPERSEDED` (MVP shape — replaced by Part M) |
| **C. Fork-and-adapt exploration** | 4–6 | OpenTTD vs gm-games vs eSports Manager; beginner comparison; 7-day gm-games fork plan | `SUPERSEDED` — build-from-scratch decided (see D1) |
| **D. Mechanic-first pivot** | 7 | Design the core mechanic before choosing code; three mechanic styles identified | `ADOPTED` (as method) |
| **E. Three candidate core mechanics** | 8 | Network Planner / Operations Balancer / Facility Controller, each with OSS reference | `ADOPTED` (as input to D2) |
| **F. Three one-page MVP specs** | 9 | One-pagers for each mechanic | `ADOPTED` (Facility Controller spec, as amended) / `REFERENCE` (other two, kept as fallback) |
| **G. Facility Controller pressure test** | 10–11 | Viability analysis, failure modes, pass criteria. *Note: the same question was asked and answered twice; the two answers are merged here (C12)* | `ADOPTED` |
| **H. Game skeleton** | 12 | 5 resources / 5 actions / 5 failure states / 5-minute scenario | `ADOPTED` (amended — C4, C7) |
| **I. 60-second game loop** | 13 | Arrival pulse → queue → constraint → intervention → resolution → score | `ADOPTED` (amended — C2, C8) |
| **J. State machines & pseudocode** | 14 | Site/vehicle/charger state machines, tick loop, minimal formulas | `ADOPTED` (amended — C8, C11) |
| **K. TypeScript data model** | 15 | Core types: Site, ChargerBay, VehicleAgent, ChargingSession, actions, scenario, root state | `ADOPTED` (amended — C4, C10, C11) |
| **L. Architecture plan** | 16 | TS sim core + React + canvas site view; layers, folder plan, tick pipeline | `ADOPTED` (canvas layer removed for MVP — C2) |
| **M. Dashboard pivot & wireframe spec** | 17–18 | Dashboard-first decision; 23-component wireframe; 11-component MVP cut line | `ADOPTED` — canonical UI spec (amended — C4, C5) |
| **N. Learning-quality gap analysis** | 19 | Hypotheses, session-success KPIs, downtime decomposition, segmentation, experiment mode, baselines, diagnostics, scenario archetypes | `ADOPTED` (split across MVP and Phase 3 — see O-items) |
| **O. Logging rationale & schema** | 20–21 | Structured NDJSON event log, run manifest, event catalogue, TypeScript logging schema | `ADOPTED` (amended — C6) |
| **P. Verification & validation discipline** | 22 | Invariants, trace mode, sensitivity analysis, calibration targets | `ADOPTED` (split across phases — O7) |

The arc, compressed: *find a game to fork* (A–C) → *no, design the mechanic first* (D–E) → *the mechanic is the Facility Controller* (F–G) → *here is its skeleton, loop, model, and architecture* (H–L) → *strip the visuals, make it a dashboard* (M) → *make it an instrument, not just a game* (N–P).

---

## 3. Decisions locked

These are the discussion's real conclusions, stated once, explicitly:

- **D1 — Build from scratch.** No forking. OpenTTD, gm-games, XSG, Open Industry Project are demoted to design references. The 7-day gm-games plan (Part C) is void. Rationale: by the time the core mechanic was defined, no candidate codebase expressed it; a clean TS sim core is smaller than an adaptation.
- **D2 — Core mechanic: Facility Controller.** "Keep one charging site flowing under changing stress." Queue pressure, constrained power, faults, and pricing are the game. Network Planner is the *later* evolution path; Operations Balancer is the *fallback* if the gate fails (§6.2).
- **D3 — Dashboard-first, no spatial view.** The MVP is a control-room sim: KPIs, tables, charts, controls, event log. Canvas/isometric rendering is deferred entirely (Phase 5).
- **D4 — Deterministic, pure sim core.** Tick-based reducer (`state → state`), seeded RNG, scenario JSON configs, serialisable actions, replayable from log. UI is a thin shell that reads selectors and emits actions.
- **D5 — MVP scenario shape.** One site, 6 bays, 2 charger tiers, one site-wide power cap, FCFS queue, 3 driver archetypes (commuter / en-route / low-SOC panic), random faults + repair, 5-minute real-time scenario driven by scripted demand waves. *(v1.1: wave timing is defined by the scenario spec's wave table, which supersedes this decision's original "every 60–90s" phrasing — that predated the D8 time-scale decision.)*
- **D6 — Instrumentation is MVP-core.** Logging, run manifests, baseline comparison, and invariant checks are built *with* the sim, not after it. The MVP is an experiment platform that happens to be playable, because the point of the MVP is learning, not shipping.
- **D7 — Stack.** TypeScript + React, no backend, local state, light store (`useReducer` or Zustand), chart library for trends. Everything runs in the browser.

---

## 4. Contradictions found and resolved

Each item: where the conflict lives → the resolution now in force.

**C1 — Fork vs build.** Part C (fork gm-games, 7-day plan) directly contradicts Parts D–P (mechanic-first, custom TS core). → **Resolved by D1.** Part C is dead; its only surviving idea is the "rename-first, mechanics-later" instinct, which reappears as "headless-sim-first, UI-later" in Phase 1.

**C2 — Visual legibility vs no visuals.** Parts G and I assume the player "can visually infer why queues are happening" and that "the site is the board"; Part M then removes the visual site entirely. The pressure-test pass criteria were never restated for a dashboard. → **Resolved:** dashboard-first stands (D3). The legibility burden transfers explicitly to `DiagnosisPanel`, `AlertsFeed`, `ActiveQueueTable`, `BayAvailabilityPanel`, `FaultsAndRepairsPanel` and the event log. New acceptance criterion: **every failure state must be diagnosable from dashboard panels alone, without reading raw logs.** The pressure-test criterion is reworded from "visually infer" to "infer from the dashboard within ~30 seconds."

*(v1.4 note: this list originally named `DiagnosisPanel`, `BayStatusMatrix` and `AlertsFeed` — three panels that then sat outside the MVP component cut, while Phase 2's exit criterion demanded diagnosability from the dashboard alone. Phase 2 could not have passed its own gate. **D25** promotes `DiagnosisPanel` and `AlertsFeed` into the cut and drops `BayStatusMatrix` from this list: `BayAvailabilityPanel` and `FaultsAndRepairsPanel` already carry per-bay state, tier, open-ness, fault and repair status between them. The list above is the amended, self-consistent one.)*

**C3 — Conflicting timescales.** Part B targets "12 in-game months," Part C targets "90 in-game days," Parts H–I define a 5-minute real-time scenario with waves every 60–90 seconds. → **Resolved:** MVP canonical time is the **5-minute real-time scenario** (one scenario ≈ one compressed operating day). The month/day horizons came from the discarded fork plans and belong, if anywhere, to Phase 5 campaign structure. All specs should use sim-seconds; nothing in the MVP references days or months. *(v1.3 note: partially superseded — D8 ratified a full 00:00–24:00 sim-day and D10/C10 introduced per-day cost rates; the operative time spec is Calibration §1.)*

**C4 — Four different action lists.** Part H's five actions include *Add bay*; Part J's loop offers four actions; Part K's `PlayerActionType` has five (no add-bay, but has `upgrade_charger`); Part M's MVP cut includes panels emitting actions that don't exist in K, while `BayAvailabilityPanel` (which emits a core action) is *outside* the MVP cut. → **Resolved — canonical MVP action set (5):**

1. `set_price` (price per kWh + connection fee)
2. `set_power_policy` (equal share / fast-first / queue relief / manual per-bay kW)
3. `schedule_repair` + `set_maintenance_level` (reactive repair and preventive spend level)
4. `toggle_bay_group` (open/close bays)
5. `upgrade_charger` (swap a bay's tier — capex)

*Add bay* is deferred to Phase 5 (site expansion). `BayAvailabilityPanel` is **promoted into** the MVP component cut; `ChargingPolicyPanel` is demoted to stretch (see C5). The "margin trap" failure state (Part H) is reworded from "aggressive expansion" to "over-upgrading / over-spending on capex the site can't recover." *(v1.3 note: since amended by D14 — `set_partial_charge_target` was later promoted to core, making the canonical set **seven** actions, and `ChargingPolicyPanel` rejoined the MVP cut.)*

**C5 — UI controls with no underlying mechanic.** Part M's panels include a *dynamic pricing toggle*, an *admission policy threshold*, and a *low-SOC priority toggle* — none of which is defined anywhere in the sim model or rules. → **Resolved:** cut all three from MVP. The one defensible stretch item is the **partial-charge target SOC** (the mechanic is defined in Parts B/H and has research backing as a queue-relief lever); if included, add `set_partial_charge_target` to the action union so model and UI agree. Rule going forward: **no control ships without a defined mechanic behind it.** *(v1.3 note: D14 later did exactly this — partial-charge is now core, with its action and the taper mechanic defined.)*

**C6 — Logging schema out of sync with the sim model.** Part O's event catalogue includes `session.payment_failed` and `payment_fault` (there is no payment system), `charger.unreachable` (there is no comms model), `abandonment_reason: "trust_loss"` (not a modelled abandonment cause), and a redundant `vehicle.queue_timeout` alongside `queue_abandoned`. Units also drift: sim model stores SOC as 0–1 fractions, logs use `*_pct`; sim says `trust`, logs say `trust_score`. → **Resolved:** remove payment and unreachable events from the MVP catalogue (they can return when those systems exist); align abandonment reasons to the modelled ones (`patience_exceeded`, `price_reject`); drop `queue_timeout`; adopt the convention **sim = fractions (0–1), logs = `*_pct`, converted only at the log boundary**; one canonical name per concept (`trust`). The event catalogue and `PlayerActionType` union must be maintained as a matched pair — a schema change to one requires reviewing the other.

**C7 — Resource taxonomy error.** Part H's "5 resources" list includes *uptime* and *queue pressure*, which are outcomes, not spendable resources. This muddies the design language (and the UI copy). → **Resolved:** reclassify. **Resources (player spends/allocates):** cash, site power. **Persistent state (earned/lost):** trust. **Derived KPIs (read-only outputs):** uptime, utilization, queue pressure, avg wait, session success. Gameplay is unchanged; the dashboard and docs use this taxonomy consistently.

**C8 — Discrete decision window vs continuous control.** Part J's state machine has a `PLAYER_DECISION_WINDOW` state and "one action every 10–15 seconds"; Part M's dashboard controls are continuously available. → **Resolved:** continuous control wins. Remove the decision-window state from the site loop; player actions append to `pendingActions` at any time and apply at the next tick. Pacing pressure comes from the scenario design (waves, faults), not from artificially gating input. If balancing later needs rate-limiting, that's a rules-layer tweak, not an architecture state.

**C9 — Every threshold is a placeholder.** Scenario goals (`minTrust`, `maxAvgWaitSeconds`…), alert thresholds, trust deltas, elasticities, fault rates — all named, none valued, anywhere in the discussion. → **Resolved:** a **calibration sheet** is a Phase 0 deliverable: expected plausible ranges for wait, utilization, abandonment, and uptime per scenario, plus first-guess constants for every named parameter, written down *before* coding. Tuned properly in Phase 3 via sensitivity sweeps. (The answer is almost certainly not 42, but we'll check.)

*(v1.4 note: the readiness review found the first pass of this incomplete — `queue_relief` had no algorithm, the "archetype reference price" the siteScore formula multiplied against was never defined, and per-archetype sensitivities were calibrated but read by nothing. D21 and D23 close those. Two numeric items are deliberately left open rather than guessed a second time: OPEN-2 (maintenance tiers are currently cost-dominant, and the only cost-side fix breaks D10) and OPEN-3 (the expected-output ranges need measuring, not re-estimating). Both are Phase 1 exit items.)*

**C10 — Missing economics inputs.** The margin formula (revenue − energy cost − maintenance) and `SiteEconomics.energyCostToday` both require an energy purchase price, but neither `SitePolicy` nor `ScenarioConfig` defines one; fixed opex (rent appears in Part C's sketch) also vanished from the final model. → **Resolved:** add `energyCostPerKwh` and a fixed `opexPerSimDay` to `ScenarioConfig`. Document the margin definition once: `margin = revenue − energy cost − maintenance − fixed opex`.

**C11 — Wall-clock time inside the sim.** `GameClock.nowMs: UnixMs` and per-event `realTimeIso` timestamps put wall-clock time inside supposedly deterministic state, breaking same-seed-same-hash replay. → **Resolved:** the sim core knows only ticks and sim-seconds. Wall-clock timestamps are stamped **only** in the run manifest and at the log-export boundary.

**C12 — Duplicated content.** The pressure-test question (Part G) was asked and answered twice with ~80% overlap. → **Resolved:** merged. No substantive conflict between the two answers; the second adds the "does it stay interesting after 10 minutes" framing, which survives as gate criterion 5 (§6.2).

---

## 5. Omissions filled

Gaps that no part of the discussion resolved (including some the discussion itself flagged late but never folded back into the spec):

- **O1 — No defined end state.** The discussion never says what "done" means for the MVP. Fixed in §6.1–6.2: the outcome is a *decision*, made against explicit gate criteria.
- **O2 — Session-success KPIs** (charge start success, session success, first-time success) — flagged in Part N, never added to `SiteMetrics` or the snapshot event. Added to the canonical KPI set.
- **O3 — Downtime decomposition** — uptime split into fault time, repair time, and closed-by-player time, rather than one monolithic percentage. Added to metrics and the reliability panel.
- **O4 — Baseline & experiment mode** — every run comparable against a fixed-policy baseline on the same seed. Promoted to MVP-core (D6). *(v1.4: this originally said "reactive maintenance", contradicting the calibration sheet and scenario spec, which both said `standard`. **D22 settles it: `standard`, and the baseline issues `schedule_repair` on the tick a fault is detected.** The baseline is a competent-but-passive operator — a played run should be measured against sensible defaults, not against negligence. Whether it repaired at all had never been stated, and that single bit swings baseline uptime between ~92% and ~98%, which is what D13's difficulty floor is checked against.)*
- **O5 — Post-run diagnosis** — end-of-run summary attributing outcomes ("most trust loss came from queue abandonment during the fault window"). MVP gets a simple rule-based version; anything cleverer is Phase 3.
- **O6 — Scenario archetypes** — corridor hub / commuter hub / destination site. MVP ships with one (corridor/roadside hub); the other two are Phase 3, and are required for the dominant-strategy gate test.
- **O7 — V&V harness** — invariant checks (queue length ≥ 0, allocated power ≤ cap, delivered kWh ≤ requested, faulted bays never charge), single-run trace mode, sensitivity sweeps. Invariants + trace: Phase 1. Sweeps: Phase 3.
- **O8 — Housekeeping never discussed:** working title (**ChargePointOperator**, per the project folder), repo location, licence (given the open-source sympathies, MIT or GPL — Mark's call), and where playtesters come from in Phase 4. Parked as open questions (§7).

---

## 6. The plan

### 6.1 Outcome — what "done" looks like

The MVP exists to answer one question with evidence:

> **Is "keep one charging site flowing under pressure" a viable core game mechanic — one that is legible, has real tradeoffs, and stays interesting — or is it just a nice simulation?**

Done = a playable, instrumented, dashboard-based prototype of one charging site, plus logged evidence from played and baseline runs, plus a short written findings note, ending in an explicit **go / tune / pivot decision** at the gate below. The deliverable of the whole MVP phase is that decision — the prototype is the apparatus.

### 6.2 The gate — pass/fail criteria

Run after Phase 4 playtesting. The mechanic **passes** if:

1. **Legibility.** After any run, the player can answer: *what went wrong, what did I do, did it move wait/cash/trust?* — from the dashboard alone, within ~30 seconds (per C2).
2. **No dominant strategy.** Across the three scenario archetypes, no single policy (e.g. "always upgrade to fast chargers", "always max price") wins everywhere. At least two distinct viable strategies exist.
3. **Multiple failure modes reachable.** At least 4 of the 5 failure states (queue collapse, power choke, reliability spiral, margin trap, trust crash) occur naturally in playtests, not just in contrived setups. *(v1.4: these five were named here and defined nowhere, which made the criterion unscoreable — you can't count what you can't detect. **D24** gives each an operational detection rule in the KPI dictionary; they're recorded per run in `RunManifest.failure_states_observed`, so this becomes a count over manifests.)*
4. **Decisions matter.** Played runs beat (or meaningfully differ from) the fixed-policy baseline on the same seed, and the three operator questions from Part N are answerable from logs: *can pricing control congestion; does maintenance pay back; does power policy lift peak throughput?*
5. **The one-more-run test.** Playtesters voluntarily replay to try a different approach. (Part G's "still interesting after 10 minutes" test.)

**Outcomes:** Pass → Phase 5 (progression, expansion, visual layer). Partial fail on 1/3/4 → tune in Phase 3 tooling and re-test. Fundamental fail on 2/5 (it's a solved puzzle or a spreadsheet) → pivot to the **Operations Balancer** mechanic (Part F's fallback spec), reusing the sim core, logging, and experiment tooling — which is most of the build.

### 6.3 MVP scope

**In:**

- One site, 6 bays, 2 charger tiers (of the 3 the model supports), one grid power cap, FCFS queue, 3 driver archetypes, faults + repair, demand waves. 5-minute scenario; one archetype (roadside/corridor hub) at MVP, three by Phase 3.
- The seven canonical actions (C4 as amended by D14) and the KPI set below.
- Deterministic sim core, seeded RNG, scenario JSON, structured NDJSON logging, run manifest, replay, invariants, baseline mode, post-run summary.
- Dashboard UI — amended cut line (the original 11 components plus four promotions, so **15** — D25): `ScenarioHeader`, `RunControls`, `KpiCardGrid` *(incl. an abandonment card adjacent to avg wait — D25)*, `PricingControlPanel`, `PowerPolicyPanel`, `MaintenancePanel`, `BayAvailabilityPanel` *(promoted, per C4)*, `ChargingPolicyPanel` *(promoted, per D14)*, `ActiveQueueTable`, `FaultsAndRepairsPanel`, `DiagnosisPanel` *(promoted, per D25)*, `AlertsFeed` *(promoted, per D25)*, `WaitTimeTrendChart` + `EconomicsTrendChart`, `EventLogPanel`. Second wave (8, aligned with Architecture §8.2): `BayStatusMatrix`, `PowerLoadChart`, `ActiveSessionsTable`, `ScenarioGoalsPanel`, `ScenarioTimeline`, `ActionHistoryPanel`, `UtilizationAndUptimeChart`, `AlertSummary`.

**Out (deferred, with destination):** visual/isometric site view (Phase 5); multi-site, map, competition, roaming (Phase 5+); add-bay expansion (Phase 5); dynamic pricing automation, admission policy, low-SOC priority (undefined mechanics — only return with definitions, per C5); payments, comms/unreachable modelling, V2G, weather, fleet contracts, real grid detail (backlog); multiplayer, mobile (not planned).

**Promoted since v1.0 (D14):** the partial-charge target-SOC policy is **MVP core**, not stretch — with a binding grid cap it's the only throughput-ceiling-raising lever. Ships with `set_partial_charge_target` (canonical action #7) and the two-segment charging taper.

**Canonical KPI set** (read-only, per C7): cash, trust, uptime (decomposed — O3), utilization, avg wait, queue length, abandonment rate, sessions completed, session success rate + charge start success rate (O2), energy delivered, margin, throughput. Definitions live in the KPI dictionary.

### 6.4 Process — phases with entry/exit criteria

Each phase is small, independently valuable, and ends with something inspectable. Headless-first means the sim is proven before any UI exists.

**Phase 0 — Design lock (paper only). — `SUBSTANTIALLY COMPLETE`**
Assemble the canonical spec from the amended parts: data model (K + C4/C10/C11 amendments), tick pipeline (J + C8), event catalogue + action union as a matched pair (O + C6), dashboard component/state map (M + C4/C5), assumptions list, and the calibration sheet (C9) with first-guess values for every constant.
*Exit:* every C-item's resolution is reflected in a spec document; no named parameter lacks a first-guess value.
*Status (v1.4):* the architecture doc, calibration sheet, KPI dictionary, scenario spec and playtest protocol are written; the readiness review found and D19–D26 closed the gaps that would have stopped Phase 1 (interruption semantics, an incomplete `ScenarioConfig`, two incompatible demand formulas, undefined `queue_relief`, unscoreable failure states, no determinism contract). **Two exit items remain open by design — OPEN-2 and OPEN-3 — because they need measurement, not another guess. They carry into Phase 1 rather than blocking it.**

**Phase 1 — Headless sim core. — `COMPLETE` (2026-08-16)**
`types.ts` → tick reducer → systems in pipeline order (arrivals, admission, queue/assign, power rebalance, charging, faults/repairs, deferred bay transitions, abandonment, refill, economics, trust/KPIs, failure-state detection, outcome check) → seeded RNG → invariant checks → logger + run manifest. Run scripted scenarios from the command line/tests. Build the fixed-policy baseline runner here too — it's just a scripted actor (spec: D22).
*Status:* built in `src/game/`, 87 tests passing, all exit criteria met — including replay from the NDJSON log alone, which reconstructs the action stream from decision markers and lands on the same final state hash. **Findings: `ChargePointOperator_Phase1_Findings.md`.** The Phase 0 specs held: nothing in them stopped the build. The measurement found four things they could not have known — trust runs away to the ceiling (OPEN-4), admission sheds the demand abandonment was meant to shed so `queue_collapse` is unreachable (OPEN-5), three of the four partial-charge options are exact no-ops (OPEN-6), and **the D13 difficulty floor fails at 30% against its ≥80% requirement** (OPEN-7). OPEN-2 is confirmed by measurement with a recommendation attached. None of the four blocks Phase 2 — they change numbers the dashboard displays, not its shape — but they should be settled before anything is tuned against them, and in that order.
*Exit:*
- the roadside-hub scenario runs headless to completion; same seed ⇒ same final state hash (D26); all nine invariants hold across a batch of seeds; NDJSON export loads and replays;
- **the ≥20-seed baseline batch is run and Calibration §7's ranges are replaced by measured values** — mean and p10/p90, not just mean (closes OPEN-3);
- **the D13 difficulty floor is verified** against that batch (the decision log says this is checked in Phase 1; the exit criteria never said so);
- **OPEN-2 has a recommendation** backed by measured fault rates, even if the decision itself waits for Phase 3.

**Phase 2 — Dashboard MVP. — `BUILT` (2026-08-16); exit partially blocked by OPEN-4/OPEN-5**
The 15-component cut wired to the store via selectors; controls emit the seven canonical actions; run/pause/speed/restart; trend charts from metric snapshots.
*Status:* all 15 components built in `src/ui/`, store and loop per **D28** (`useReducer` + context; hand-rolled SVG charts). A full day plays in the browser at 1×/2×/4× and scores itself; the seven actions all dispatch and land the following tick; the two trend charts read the snapshot stream; both the site log and the action history are visible. UI-level findings are in **D29**.
*Exit:* **MET.** A full 5-minute scenario is playable in the browser ✅; event log and action history visible ✅; each of the 5 failure states can be reached and **diagnosed from the dashboard alone** (C2 criterion) ✅ — the diagnosis half was built and verified in Phase 2, and D30/D31 closed the reachability half: four states arise in-sim (`power_choke` and `reliability_spiral` under the baseline, `queue_collapse` and `trust_crash` under a plausible mistake) and `margin_trap` is asserted against the paired baseline in `compareRuns`. A regression test fails if any of the four stops being reachable. **Nothing in the dashboard changed to close this — the blockage was upstream, exactly as recorded.** *(The rest of this exit is only reachable because D25 moved `DiagnosisPanel` and `AlertsFeed` into the cut — with them second-wave, the criterion demanded diagnosis from panels that didn't exist yet.)*

**Phase 3 — Experiment & tuning layer.**
Baseline-vs-played comparison view; post-run diagnosis summary; sensitivity sweeps over arrival rate, price elasticity, fault rate, patience (checking outputs move in sane directions — P); calibrate thresholds against the Phase 0 sheet; add commuter-hub and destination-site archetypes; second-wave dashboard components as needed for diagnosis.
*Exit:* the three operator questions are answerable with logged evidence; thresholds are set from data rather than guesses; three archetypes playable.

**Phase 4 — Playtest & gate. — `APPARATUS READY; BLOCKED ON TESTERS`**
Self-playtests plus **3 external testers** (each: 3+ runs, think-aloud, then the three legibility questions) — the protocol's §5 thresholds assume 3, with a documented fallback if only 2 can be found. Run the gate (§6.2). Write a 1–2 page findings note.
*Status:* **criteria 2, 3 and 4 are scored and all three pass** — `ChargePointOperator_Gate_Scorecard.md`. Criterion 3 came in at **5 of 5** failure states across 36 runs of plausible play, against a threshold of 4. The app supports the fixed `pt-1`/`pt-2`/`pt-3` seeds and writes a manifest + NDJSON per run, auto-labelled `tester-run`; `ChargePointOperator_Session_Pack.md` is the observer's sheet for a 30-minute session.
**Criteria 1 and 5 are deliberately unscored.** Legibility is measured by asking three frozen questions of someone who did not build this; the one-more-run test is whether a tester *volunteers* a third go. Filling those rows from self-play would produce a number and destroy its meaning — which is the whole reason the protocol was frozen before the build. **This phase cannot complete without three people** (OPEN-1).
*Exit:* an explicit go / tune / pivot decision, recorded. **Not yet reachable.**

**Phase 5 — Post-MVP (sketch only, do not pre-build).**
Progression (unlocks, second site, capex/add-bay), longer campaign clock (this is where the 90-day/12-month horizons return), portfolio → network-planner layer (Part F's spec), visual site view (canvas → isometric), and the deferred mechanics backlog. To be planned properly only after the gate passes.

### 6.5 Working practices

Two rules pulled from the wreckage of the discussion itself: **no control without a mechanic** (C5) and **schema changes travel in pairs** — sim model, action union, event catalogue, and dashboard bindings are checked against each other whenever any one changes (C6). Scope discipline: the wireframe grew from 4 panels to 23 components in one turn; the cut line exists for a reason. When in doubt, the smaller version ships first.

Two more, added by the readiness review after watching how these documents actually drifted:

- **No field without a reader.** C5 was applied to UI controls and not to the model, so `targetMaxWaitSeconds`, `minRequiredSoc`, `maxAcceptableWaitSeconds`, `reservePowerKw`, `baysOpenByDefault` and `refundsToday` all accumulated in the types with nothing reading them — and `refundsToday` would have silently broken cash reconciliation the first time anything wrote to it. A field with no formula behind it is a control with no mechanic wearing a different hat.
- **Names matching is not meanings matching.** The paired-schema rule checks that the action union and the event catalogue use the same *names*; it caught nothing when `chargeStartSuccessRate` was defined two incompatible ways in two canonical documents, or when the sim and the logs kept entirely separate vocabularies for abandonment reasons. **The KPI dictionary is canonical for meaning**, and a definition change there is a schema change that travels with the C6 pair.

### 6.6 Risks

- **Sandbox-not-game** — the core risk Part G identified. Mitigated by the gate being about legibility and replay-desire, not sim fidelity, and by the Operations Balancer fallback costing little (shared core).
- **Hidden-parameter dominance** — a "finding" that's really one elasticity constant doing all the work. Mitigated by sensitivity sweeps (Phase 3) before drawing conclusions.
- **Dominant strategy already visible on paper** — the sharpest live threat to gate criterion 2, and it has two known instances before a line of code exists. (1) `preventive` maintenance is currently cheaper *and* better than `standard` (Calibration §4a, OPEN-2). (2) Under a binding grid cap, the £40k upgrade may simply never be right, since it buys no throughput at exactly the moments the site is in trouble and no action can buy grid capacity (Scenario §5a). Mitigated by naming both now, so Phase 3 sweeps go looking rather than discovering them at the gate.
- **Scope creep** — the discussion demonstrated the failure mode live. Mitigated by the cut lines and deferral destinations in §6.3.
- **Tuning rabbit hole** — balancing queue/price/trust maths is the genuinely hard part (Part L said so). Timebox Phase 3; "sane directions" beats "perfect values" for a gate decision.
- **Solo bandwidth** — phases are sized so each ends with standalone value; a stalled project still leaves a proven headless sim and a written spec.

---

## 7. Open questions

The original four were ratified by Mark on 2026-08-16 — see the Decision Log for full entries: licence/visibility → private until the gate, licence chosen at Phase 5 (D16); partial-charge → promoted to MVP core (D14); store/chart libraries → deliberately deferred to Phase 2 start (D17); playtesters → parked to late Phase 3 (OPEN-1).

The readiness review opened two more, both deliberately left open rather than guessed: **OPEN-2** (maintenance tiers are cost-dominant — now confirmed by measurement, with a recommendation) and **OPEN-3** (**closed** — Calibration §7 now holds measured values).

Phase 1's measurement opened four; two are now closed. **OPEN-4** (trust ran to the ceiling) is **closed by D30** — baseline trust now ends at 56.4, in band, and `minTrust` scores. **OPEN-5** (`queue_collapse` unreachable) is **closed by D31** — all five failure states are now reachable, and the cause turned out to be measurement noise in the detector rather than the behaviour the finding blamed. **OPEN-7** is closed — `minOperatingMargin` £2,200 takes the D13 floor to 80% on the corridor, and the two Phase 3 archetypes were calibrated the same way (85% and 80%). Still open, both now measured on all three archetypes and both awaiting a decision rather than more evidence: **OPEN-2** (preventive maintenance wins everywhere — and Phase 3 shows the cause is the per-repair price, not the uptime) and **OPEN-6** (three of the four partial-charge options are exact no-ops).

**The Decision Log is the sole home of open items.**

---

## Appendix — Where each superseded idea went

| Discarded item | From | Fate |
| :-- | :-- | :-- |
| Fork gm-games + 7-day plan | Part C | Void (D1); "prove core before UI" instinct survives as headless-first Phase 1 |
| Fork OpenTTD | Parts A/C | Design reference for network economics; relevant again only at Phase 5 network layer |
| 90-day / 12-month win states | Parts B/C | Phase 5 campaign clock |
| Canvas site view in MVP architecture | Part L | Phase 5; legibility duties reassigned to dashboard (C2) |
| Add-bay action | Part H | Phase 5 expansion |
| Dynamic pricing toggle, admission policy, low-SOC priority | Part M | Cut — no defined mechanic (C5); may return with definitions |
| Payment & unreachable log events | Part O | Parked until payment/comms systems exist (C6) |
| `PLAYER_DECISION_WINDOW` state | Part J | Removed — continuous control (C8) |
| Network Planner & Operations Balancer specs | Part F | Phase 5 evolution path and gate-fail fallback respectively |

*So long, and thanks for all the fish — the discarded parts weren't wasted; they're why the surviving plan is narrow.*

