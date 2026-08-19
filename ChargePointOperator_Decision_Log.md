# ChargePointOperator — Decision Log

**Purpose:** running ADR-lite record. The original Perplexity discussion drifted because nothing recorded what had been decided; D1–D7 fixed that retroactively (Plan §3) — this file keeps it fixed. One entry per decision: what, why, consequences. Statuses: **accepted** · **proposed** · **open** · **superseded**.

Rule of use: before re-litigating anything, check here first. To reverse a decision, add a new entry superseding the old one — don't edit history.

---

## Accepted

**D1 — Build from scratch, no fork.** *(2026-08-16, Plan §3)* OSS projects (OpenTTD, gm-games, XSG, Open Industry Project) are design references only. *Consequence:* the 7-day gm-games plan is void.

**D2 — Core mechanic: Facility Controller.** *(2026-08-16, Plan §3)* "Keep one charging site flowing under pressure." *Consequence:* Operations Balancer is the gate-fail fallback; Network Planner is Phase 5.

**D3 — Dashboard-first, no spatial view in MVP.** *(2026-08-16, Plan §3)* *Consequence:* legibility burden carried entirely by dashboard panels (C2 rule).

**D4 — Deterministic pure sim core.** *(2026-08-16, Plan §3)* Tick reducer, seeded RNG, serialisable actions, replay from logs. *Consequence:* same seed + actions ⇒ same state hash, enforced by test (arch invariant 9).

**D5 — MVP scenario shape.** *(2026-08-16, Plan §3)* One site, 6 bays, 2 tiers, power cap, FCFS, 3 archetypes, faults, 5-minute scenario; wave timing per the scenario spec.

**D6 — Instrumentation is MVP-core.** *(2026-08-16, Plan §3)* Logging, manifests, baselines, invariants built with the sim, not after.

**D7 — Stack: TypeScript + React, no backend.** *(2026-08-16, Plan §3)*

**D8 — Time scale: full 24-hour day at 288×.** *(ratified by Mark 2026-08-16, amended from the proposed 16h/192×)* One scenario = 00:00–24:00 (86,400 sim-s) in 5 real minutes; tick = 60 sim-s → 1,440 ticks/run. *Why:* Mark chose the full day over the proposed operating-day. *Consequences:* the run opens at night — a natural calm learn-the-board phase; overnight arrivals are sparse and panic-heavy. **Watch-item:** the quiet opening spans ≈62 real seconds (00:00–05:00) to ≈87 (through 07:00); if it proves dead air in playtests, the tuning option is variable compression (fast-forward small hours), not a redesign. UI pacing constants still tuned in real seconds (A9).

**D9 — Metric snapshot cadence: 300 sim-seconds.** *(ratified 2026-08-16)* Now 288 snapshots/run under D8. Supersedes Architecture v1.0's "5 sim-seconds".

**D10 — Realistic £ economics.** *(ratified by Mark 2026-08-16, amended from the proposed play-scaled option)* **Constants amended by D35 (2026-08-17) — the upgrade is now £75,000 and starting capital £100,000; read D35 before quoting the figures below.** Real-world magnitudes: ~£0.79/kWh price, ~£0.28 energy cost, ~£40k charger upgrade, **starting capital £50,000**. *Why:* Mark chose realism over play-scaling. *Consequences (what makes it workable):* (1) the win goal changes from a cash floor to **minimum cumulative operating margin** — a £50k float makes "end richer than you started" meaningless; (2) capex is judged **operationally** (throughput/wait/trust improvement), never by in-run payback — real capex pays back in months, and D12's margin-excludes-capex ruling is what stops an upgrade tanking the scored metric; (3) starting capital funds **at most one** major upgrade, making it a genuine commitment; (4) bankruptcy (cash < £0) is retained as a theoretical fail state only. Assumption A8 rewritten.

**D11 — Canonical action set & paired-schema rule.** *(2026-08-16, Plan C4/C6; Arch §5.6/§10)* Actions: `set_price`, `set_power_policy`, `toggle_bay_group`, `schedule_repair`, `set_maintenance_level`, `upgrade_charger`. *Amended by D14:* `set_partial_charge_target` promoted from stretch to core — the set is now **seven**. Action union, log catalogue, dashboard writes, and consuming systems change together. No UI control without a defined mechanic.

**D12 — KPI definitions per the KPI dictionary.** *(ratified 2026-08-16)* Uptime excludes player-closed time; utilization bay-time-based (power utilization separate); avg wait excludes abandoners and always displays paired with abandonment; margin excludes capex. *Note:* the margin-excludes-capex ruling is load-bearing for D10.

**D13 — Scenario difficulty floor.** *(ratified 2026-08-16)* Baseline policy must fail ≥1 win goal on **≥80% of seeds**, checked in the Phase 1 seed batch. *Consequence:* under D10 the floor is expected to bite on the operating-margin goal — active price/power management should be the difference. Tighten `minOperatingMargin`/`minTrust` first if the baseline wins.

**D14 — Partial-charge mechanic promoted to MVP core.** *(ratified by Mark 2026-08-16; supersedes the "stretch" status from Plan C5)* *Why:* when the grid cap binds, lowering target SOC is the **only** lever that raises the throughput ceiling — everything else redistributes it. *Consequences:* `set_partial_charge_target` is canonical action #7; a two-segment charging taper ships with it (power drops sharply above 80% SOC — partially resolving A1, and making partial-charge a real trade rather than a free lunch); `ChargingPolicyPanel` joins the MVP dashboard cut (then **13 components**; *amended by D25 — the cut is now 15*).

**D15 — Per-vehicle max charge rate added to the model.** *(ratified by Mark 2026-08-16; resolves assumption A2, which had been tracked as an open item here)* `maxChargeRateKw` on `VehicleAgent`; `effectivePowerKw = min(bayAllocated, vehicleMax) × taper(SOC)`. *Why:* keeps ultra-rapid bays and the now-realistic £40k upgrade honest.

**D16 — Private repo until the gate passes.** *(ratified by Mark 2026-08-16; resolves former O-1)* Licence chosen at Phase 5 with a working prototype in hand.

**D17 — Store/chart library choice deferred to Phase 2 start.** *(ratified by Mark 2026-08-16; resolves former O-2)* Candidates on the table: `useReducer` + Recharts (boring, zero deps) vs Zustand + Recharts (nicer slice subscriptions). Decide when the dashboard's real subscription patterns are visible; revisit this entry then. **Resolved by D28.**

**D28 — Store: `useReducer` + context. Charts: hand-rolled SVG, no chart library.** *(2026-08-16, Phase 2 start; resolves D17)*

*Store.* `useReducer` + a React context, with `useMemo`'d selectors at the leaves. **Why, now that the subscription pattern is actually visible:** the sim replaces the *entire* `SimulationState` object every tick — that is the D4 purity contract, not an implementation detail — and at 4.8 ticks per real second (up to ~19 at 4× speed) essentially every panel's data changes on every tick. Zustand's advantage is letting a component subscribe to a slice that changes *less often* than the rest of the store; here no such slice exists. It would add a dependency to solve a problem this architecture cannot have. The one genuinely slow-changing thing — snapshot history for the trend charts — is append-only and already memoised by array identity.

*Charts.* The two MVP charts (`WaitTimeTrendChart`, `EconomicsTrendChart`) plot a fixed-cadence, fixed-domain series that the sim already snapshots every 300 sim-seconds (D9). A chart library earns its weight on axes, tooltips, responsiveness and interaction; here the domain is known in advance, there are ≤288 points, and every visual detail needs overriding anyway to match the instrument-panel aesthetic. Hand-rolled SVG is ~120 lines and no dependency. **This is a deviation from D7's "chart library for trends"** and is recorded as such: revisit at Phase 3, when the second-wave charts (`PowerLoadChart`, `UtilizationAndUptimeChart`) may want brushing and shared crosshairs — that is the point at which a library starts paying for itself.

*Consequence:* the browser build has exactly two runtime dependencies, `react` and `react-dom`. If either half of this proves wrong it is a contained swap, which is part of why it was chosen.

**D18 — End-of-run close-out sweep.** *(2026-08-16, final review)* At 24:00, still-charging sessions finalize as completed (partial delivery recorded in the post-run summary); still-queueing vehicles leave with reason `scenario_end`, excluded from the abandonment-rate numerator. *Why:* reconciles the KPI-dictionary funnel identity with architecture invariant 7 — vehicles mid-service at run end previously had no bucket. *Consequence:* `QueueLeaveReason` gains `scenario_end`.

---

*D19–D26 come from the readiness review (2026-08-16). That review found the docs internally inconsistent in ways that would have stopped Phase 1 within a day: an invariant that contradicted the fault model, a `ScenarioConfig` that could not express its own scenario, two incompatible demand formulas, and calibrated fields that nothing read. These entries close those holes.*

**D19 — Interruption and occupancy-transition semantics.** *(2026-08-16, readiness review)* Three rules, previously undefined:

1. **Fault while charging.** Within the tick, the session is detached *first* — finalized with `completed: false`, `interruptedByFault: true`, `deliveredKwh` recorded — *then* the bay moves to `faulted`. The vehicle terminates as `left` with new reason `service_interrupted`. Trust −2.0 (the existing "fault mid-session" delta).
2. **Closing an occupied bay** (`toggle_bay_group` with `open: false`). Deferred, not immediate. The bay sets `closeRequested: true` and stops accepting new assignments *that tick*; `isOpen` flips false when the bay next reaches `idle`. Opening a bay takes effect immediately.
3. **Upgrading an occupied bay** (`upgrade_charger`). Same deferral via `pendingUpgradeType`. **Capex is debited at the action tick**, not at the swap, so cash movement stays on the tick the player acted.

*Why:* invariant 4 ("a faulted/repairing/closed bay never has an active session") flatly contradicted a fault model that fires on charging bays, and the vehicle state machine had no exit from `[CHARGING]` other than `[COMPLETE]`. The ordering rule (detach, then fault) is what makes invariant 4 true rather than aspirational. *Consequences:* `QueueLeaveReason` gains `service_interrupted`; `ChargerBay` gains `closeRequested` and `pendingUpgradeType`; the vehicle state machine gains a fault branch; the funnel's `interrupted_by_fault` bucket finally has a leave reason to carry it.

**D20 — `ScenarioConfig` completed.** *(2026-08-16, readiness review)* The type could not express `roadsideHub.ts`: no bay roster, no initial trust/fee/policy/maintenance level, no scripted-fault schedule, no upgrade cost table, no queue capacity, no fail rules. All added (Arch §5.7), plus `tickSeconds` and `referencePricePerKwh`. *Consequence:* `UpgradeChargerAction.capexCost` is **removed** — cost is resolved from `scenario.upgradeCosts`. A self-priced action let a hand-edited replay log mint money, in a core whose whole claim is determinism.

**D21 — One demand formula, one admission formula.** *(2026-08-16, readiness review)* The architecture had `arrivalRate = baseDemand × waveMultiplier × priceElasticity(price)` with no `baseDemand` defined anywhere, while the wave table gives *absolute* rates; and the calibration sheet hard-coded an elasticity of 1.2 alongside a per-wave `priceElasticity` of 0.7–1.2. Resolved:

- `effectiveArrivalRatePerMinute = wave.arrivalRatePerMinute × priceMultiplier`, where `priceMultiplier = clamp(1 − wave.priceElasticity × (price − scenario.referencePricePerKwh) / scenario.referencePricePerKwh, 0.3, 1.5)`. The wave value **is** the elasticity coefficient; the hard-coded 1.2 is gone.
- `siteScore` now reads the per-archetype `priceSensitivity` and `waitSensitivity`, which were calibrated and then never used by any formula. Coefficients rescaled accordingly (Calibration §5) and a per-archetype `referencePricePerKwh` added — the old "£0.10 above archetype reference" had no reference defined.

*Consequence:* archetypes now differentiate on admission as designed — commuters shed first at ~9 sim-min expected wait, panic arrivals effectively never reject. Worked example in Calibration §5.

**D22 — Baseline policy pinned, including repairs.** *(2026-08-16, readiness review)* Plan O4 said the baseline runs `reactive` maintenance; the calibration sheet and scenario spec said `standard`. **`standard` wins** — the baseline is a competent-but-passive operator, so a played run is measured against sensible defaults rather than against negligence. The baseline also **issues `schedule_repair` on the tick a fault is detected**. *Why:* whether the baseline repairs was never stated, and it swings baseline uptime between ~92% and ~98% — which is the number D13's difficulty floor is checked against. *Consequence:* Plan O4's "reactive" is superseded; `experiment/baselinePolicy.ts` has one unambiguous spec.

**D23 — Power policies defined; `reservePowerKw` cut.** *(2026-08-16, readiness review)* `queue_relief` was in the policy union, the action, the panel and the sanity-gradient table, but had no algorithm anywhere. Now defined (Arch §6.1) as shortest-remaining-time-first: finish sessions soonest, free bays fastest. `equal_share`, `fast_first` and `manual` are specified alongside it.

`reservePowerKw` is **removed** from the model and the action. *Why:* nothing described what reserving power did, and with a flat energy price (A10) and full rebalancing every tick there is no mechanic for it to serve — it was a control without a mechanic, which C5 forbids. *Consequence:* invariant 2 simplifies to `Σ allocatedPowerKw ≤ gridPowerKw`. It returns if and when a time-of-use or demand-charge mechanic exists (Phase 5).

**D24 — The five failure states get operational definitions.** *(2026-08-16, readiness review)* Gate criterion 3 requires "≥4 of 5 failure states observed arising naturally," but *queue collapse*, *power choke*, *reliability spiral*, *margin trap* and *trust crash* were named and never defined — the criterion was unscoreable. Detection rules now live in KPI dictionary §"Failure states". They are **detection-only**: they do not end the run (the only hard fails remain bankruptcy and sustained trust < 30), they are logged as `failure_state.entered` / `failure_state.cleared` and summarised in `RunManifest.failureStatesObserved`. *Consequence:* criterion 3 becomes a count over run manifests instead of a judgement call.

**D25 — MVP dashboard cut → 15 components.** *(2026-08-16, readiness review)* C2 assigned the entire legibility burden to `DiagnosisPanel`, `ActiveQueueTable`, `BayStatusMatrix`, `AlertsFeed` and the event log — then three of those five sat outside the MVP cut, while Phase 2's exit criterion demanded every failure state be diagnosable from the dashboard alone. Phase 2 could not pass its own gate. Resolved: **`DiagnosisPanel` and `AlertsFeed` are promoted into the MVP cut** (their thresholds and events were already fully specified), and the KPI strip gains an **abandonment card adjacent to avg wait**, without which the KPI dictionary's binding survivorship rule cannot be honoured. `BayStatusMatrix` stays second-wave — `BayAvailabilityPanel` plus `FaultsAndRepairsPanel` cover per-bay state for MVP; C2's list is amended to say so. *Consequence:* 15 MVP components, 8 second-wave; `alert.raised`/`alert.cleared` join the MVP log catalogue cut.

**D26 — Determinism contract made explicit.** *(2026-08-16, readiness review)* D4 promised same-seed-same-hash and invariant 9 tests it, but nothing named the PRNG, the hash, or the timestep — and seeds were typed `number` while the playtest seeds are `pt-1`/`pt-2`/`pt-3`. Pinned:

- **PRNG:** `mulberry32`. State is one uint32, serialised into `rngState` as 8 lowercase hex chars. **One global stream**, drawn in pipeline order — no per-system streams (they reorder under refactoring and silently break replay).
- **Seed:** `string` everywhere (`RunManifest.seed`, `BaseLogEvent.seed`). Hashed to the uint32 PRNG state with FNV-1a. Numeric seeds are just strings.
- **State hash:** FNV-1a over canonical JSON — object keys sorted, `eventLog` excluded.
- **Fixed timestep:** `deltaSeconds` is always `scenario.tickSeconds` (60). The UI speed control changes how many ticks run per real second and **never** the tick size. A variable timestep would break replay on the first frame-rate hiccup.

*Consequence:* `Math.random()` is banned outside tests; `rng.ts` is the only randomness source (already the rule in Arch §3, now enforceable).

---

*D27 comes from the Phase 1 build (2026-08-16). The headless core was built to the letter of the Phase 0 specs; everything it found is in `ChargePointOperator_Phase1_Findings.md`. The specs held up — no contradiction was found that stopped the build — but four numeric/mechanical items now need deciding, and they are OPEN-4 to OPEN-6 plus a re-set of the goals.*

**D27 — Phase 1 implementation decisions, taken to the specs' own rules.** *(2026-08-16, Phase 1 build)* Six places where the specs were silent and the build had to choose. None changes a mechanic; each is recorded so it can be overturned cheaply:

1. **`allocated` means "plugged in, drawing nothing."** The state existed in the model with no rule attached. A bay holds `allocated` when it has a session but its power policy gave it 0 kW (`fast_first` starves marginal bays), and for the tick in which it is filled from the queue. This makes the KPI dictionary's "charging **or** allocated counts as occupied" meaningful rather than vacuous, and keeps faults firing only on bays actually delivering power.
2. **ROLL metrics are computed from a ring of per-tick samples** held in state, not from mutated running averages — the dictionary demanded the latter be avoided but named no mechanism. The ring is 60 ticks, covering both the 900 s ROLL window and the 3,600 s trust window.
3. **Revenue accrues per tick as energy is delivered**, with the connection fee taken at session start. The alternative (bill everything at completion) makes invariant 6 unreconcilable per tick and mishandles fault-interrupted sessions.
4. **Bay-time is attributed at end of tick**, after all transitions have landed, one bucket per bay per tick.
5. **`margin_trap` is evaluated in `compareRuns`, not in the sim.** Its definition needs the paired same-seed baseline, so no single run can detect it. Detection-only, appended to the played run's manifest.
6. **A distributive `PlayerActionDraft` type** is the pre-stamp form of an action. A plain `Omit` over the union silently collapses to the shared keys and drops every payload field.

*Consequence:* documented in `Architecture` terms in the code comments at each site; nothing here needs a spec amendment, but item 1 is the one most worth knowing when reading the dashboard's utilization number.

**D29 — Dashboard conventions settled during the Phase 2 build.** *(2026-08-16, Phase 2)* Five decisions the architecture's component spec did not reach, each recorded because it changes what a player reads:

1. **Goal cards are coloured by pace against *demand*, not against the clock.** A cumulative goal is scored at midnight, so a card must answer "am I on track?" mid-run. Judging that on elapsed time paints the strip red all night, when 00:00–05:00 carries ~3% of the day's arrivals and there is nothing to be behind on. The tone compares progress with the share of the day's arrivals that has actually been through the site.
2. **Controls are disabled once the day is scored**, via a `fieldset` around the floor. Found by clicking a live-looking "Call out a repair" after 24:00 and watching nothing happen — precisely the class of thing the playtest protocol counts as a legibility bug.
3. **Event `message` carries prose, `data` carries the token.** The log was showing `panic_low_soc charging on Bay 3` to the player. `data.archetype` keeps the canonical value for analysis and replay; the message says "Low-battery driver". Internal identifiers in player-facing copy are a legibility bug, not a cosmetic one.
4. **The power bus is the dashboard's one picture.** 350 kW of supply, segmented by bay and coloured by tier, with the uncommitted remainder hatched. It exists so `power_choke` is *seen* rather than inferred, which is what C2 asks of a build with no spatial view. It is also why the two charger tiers own the only two identity colours on the page: every other colour is a status.
5. **`ChargingPolicyPanel` shows how many drivers each limit would cut short.** An OPEN-6 mitigation, not a fix: with every driver targeting 80%, the 90% and 80% settings do nothing, and the panel now says so ("no one on site right now") instead of hiding it. Remove this readout only if OPEN-6 resolves by giving driver targets real spread.

*Consequence:* items 1–3 are general rules for the second-wave components too. Item 5 is provisional on OPEN-6.

---

*D30–D31 close OPEN-4 and OPEN-5 (2026-08-16). Both were model changes, so both are recorded here before the calibration sheet and the code. Every number in them was set from a measured distribution, not chosen on paper — which is the habit OPEN-3 taught.*

**D30 — Trust rebalanced: serving someone is the job, not a favour.** *(2026-08-16; resolves OPEN-4)* The v2.2 deltas were net **+42/day** under baseline play, so trust ran to the 0–100 ceiling on every competent run. The measured event volumes are what explain it: a day carries **183 completions against ~10 failures**, so *any* per-completion reward swamps every penalty that exists. Changes:

| Delta | Was | Now | Why |
| :-- | :-- | :-- | :-- |
| `completion` | +0.1 | **0** | Completing a session is the baseline expectation, not a service worth thanking you for. At 183/day it was +18 on its own. |
| `fastCompletionBonus` | +0.3 (stacked) | **+0.1** (exclusive) | Still the thing worth talking about — a plug free when you arrive — but it no longer stacks on a flat reward. |
| `slowCompletionPenalty` | *(did not exist)* | **−0.05** | **The real gap.** Wait touched trust only when someone *gave up*; a site with 20-minute queues that everyone tolerated lost no reputation at all. |
| `uptimeBonusThresholdPct` | 95% | **98%** | 95% uptime is ordinary. 98% is a site that genuinely never breaks. |
| `priceRejection` | −0.05 | **−0.15** | A driver who sees the queue and drives on is a reputation event, not a rounding error — and it is where 18–23% of the day's demand goes. |

*Measured consequence:* baseline trust ends at **56.4** [p10 49.6 · p90 62.2] against an expected 45–70 — in band, from 96.3 before. *Three things this unblocks:* `minTrust` becomes a live goal (baseline meets it on 60% of seeds, not 100%); `trust_crash` becomes reachable; and `siteScore`'s trust term stops silently inflating admission — at trust 96 every arrival carried **+0.6** on a threshold of 0.15, against the +0.12 the formula was calibrated around. **The utilization and session figures measured in Phase 1 were partly an artefact of that**, and Calibration §7 is re-measured accordingly.

**D31 — Drivers misjudge the wait, and a sustained condition is measured over the span it must be sustained across.** *(2026-08-16; resolves OPEN-5)* Three changes, in the order they were found:

1. **Perceived wait carries noise (`WAIT_PERCEPTION_NOISE = 0.35`).** A4 always allowed for this — *"add noise to `expectedWait` if admission feels twitchy"*. With perfect information every arrival read the true projected wait and drove on, so the queue capped itself at ~5 of 12 slots and abandonment measured 2.4% against an expected 8–25%. Each arrival now judges `trueWait × U(0.65, 1.35)`. The log carries both `expected_wait_seconds` (what they acted on) and `true_wait_seconds`.
2. **The enter side of failure detection gets hysteresis (`FAILURE_ENTER_GRACE_SECONDS = 300`).** A single tick where the condition dipped wiped out half an hour of accumulated collapse. Measured: both `queue_collapse` conditions held for 3–17 *consecutive* ticks against a 30-tick requirement, but 17–49 ticks *in total* over the same window. The KPI dictionary already argues this case for alerts; it applies just as much to entering a state as to leaving one.
3. **`queue_collapse`'s abandonment arm reads the sustain window (1,800 s), not the 900 s card window**, and its pressure threshold drops **2.0 → 1.0**. Over 900 s the abandonment rate swings between 0% and 50% every time a session starts — a condition asked to hold for half an hour was being reset by its own measurement noise. The pressure threshold was then set from the joint distribution rather than from paper: across 5 seeds the longest window in which pressure *and* sustained abandonment both held was **0 ticks under baseline at every combination tried**, and **44 ticks at pressure ≥ 1.0 with abandonment ≥ 30%**. So 1.0 never fires on a competent run and fires reliably on a real mistake. It also reads plainly: *a car queued for every bay you own, and a third of the people who committed walking away, for half an hour.* `queueCollapseClearPressure` follows to 0.7, and the `queue_overload` alert drops to 1.0/0.7 so it stays a genuine early warning of the same condition rather than a threshold above it.

*Measured consequence:* **all five failure states are now reachable.** The baseline shows `power_choke` (17/20 seeds) and `reliability_spiral` (11/20) and nothing else — correct, since it is a competent operator. Cutting the price to £0.45, the classic "I'll attract customers" mistake, produces `queue_collapse` and `trust_crash` alongside them; neglecting repairs produces `reliability_spiral` and `trust_crash`; `margin_trap` needs the paired baseline and is asserted in `compareRuns`. **Gate criterion 3 (≥4 of 5 observed naturally) is satisfiable for the first time.**

*Note on what did NOT change:* abandonment still measures 1.8% at baseline, below the 8–25% the sheet expected. That expectation was written before admission read per-archetype wait sensitivity (D21). With drivers who can see a queue and leave, a competently-run six-bay site simply does not generate mass abandonment — the demand goes at the gate instead, and the funnel accounts for it there. The 8–25% figure is now recorded as wrong rather than the sim being wrong; see Calibration §7.

**D32 — Two model additions for Phase 3, both with real readers.** *(2026-08-16, Phase 3)*

1. **`ScenarioConfig.patienceMultiplier` / `urgencyMultiplier`.** Site-level modifiers on driver behaviour. Added because the destination-site archetype is *defined* by them — people park, leave the car and come back in two hours, so they wait far longer and arrive far less desperate than a corridor driver. They double as the patience sweep's axis. Both default to 1 and are read in `arrivals.ts`; no field without a reader (Plan §6.5).
2. **`RunOptions.transformInitialState`** — an experiment-only seam. The fault-rate sweep scales each bay's `reliabilityBase`, which is per-state and has no business being a scenario field. Never used by the game itself.

*Consequence:* `ScenarioConfig` grows two optional fields; the sweep harness needs no global mutation of the calibration constants, which would have been the alternative and would have leaked across runs.

**D33 — Maintenance dominance resolved, and the charging limits re-scoped.** *(2026-08-16, decided by Mark; resolves OPEN-2 and OPEN-6)*

**OPEN-2 — two changes, and the second only became available because of the first.**

1. **The repair call-out costs £200 whatever your contract is.** The ladder (£300/£200/£150) paid preventive twice — fewer faults *and* a discount on each. Flattening removes the double-count.
2. **Preventive's standing charge £45 → £150/day.** That is £55k/year, or **£9.1k per bay** — a normal price for a comprehensive O&M contract with scheduled servicing on DC rapid hardware. The old £45/day was £2.7k per bay, cheap even for basic break-fix.

*Why this is a tune and not the realism breach it looked like:* the earlier analysis said preventive needed ~£460/day to break even and concluded, correctly at the time, that no cost-only fix existed inside D10. That figure was measured while preventive was still getting the call-out discount. **Removing the double-count cut the break-even by two thirds and brought it inside realistic pricing** — the arithmetic was right, the option set was incomplete.

*Measured consequence — the trade now varies by site, which is what the mechanic was always supposed to be:* preventive gains +0.50 goals on the corridor (3.7 faults/day), +0.20 on the commuter hub, and **−0.60 on the destination site** (1.5 faults/day), where it is now the third-worst strategy and loses to changing nothing. The dominant-strategy test went from two winners *both containing preventive* to **three distinct winners** — `preventive`, `premium+preventive`, `premium`. Buy reliability where things break; don't where they don't.

*Consequence for §8:* the sanity table's "margin ↓ under preventive" is retired. The sign is now archetype-dependent by design, which a single-scenario gradient cannot express — the dominant-strategy test is the instrument that can. All **19/19 gradients** now behave as specified.

**OPEN-6 — charging limits re-scoped to off / 0.70 / 0.60 / 0.50** (from off/0.90/0.80/0.70). Every driver already targets 0.80 or less, so the top two settings measured identical to "off" across 20 seeds. The mechanic is well-behaved across its whole range; the range now offered is the one where it does something. *Not taken:* giving driver target SOC real spread (0.70–0.95), which is the better model and remains available in Phase 5 — it would restore a meaningful "gentle cap" setting.

**D34 — Dark-theme contrast fixed, and the rule that was missing.** *(2026-08-16, reported by Mark)* The dashboard shipped with every small label at **3.2–3.9:1** against its surface, well under WCAG AA's 4.5:1 for text below 18.66px — and those labels are also the smallest, most letterspaced text on the page, so it was the worst combination available.

**The root cause is worth recording, because it will recur.** The palette *was* validated — as **chart marks**, where the bar is 3:1 because a line on a plot is a graphic. The same tokens were then used for text, where the bar is 4.5:1, and `--tier-rapid` (4.31:1) quietly failed while `--ink-3` (3.2:1) failed badly. **A colour that passes one bar does not pass the other, and nothing was checking.**

Changes: the text ramp is raised to clear AA on all three surfaces (13.9 / 9.5 / 5.8 on panel, and ≥4.5 on the darkest); the charger tiers now carry **two forms** — the validated pair for marks and fills, and lighter `-text` variants (7.3:1, 7.1:1) for labels, same hue and meaning; and no declared font-size sits below 9.5px, because uppercase letterspaced text at 9px is hard to read at any contrast.

*Consequence:* `tests/contrast.test.ts` parses `app.css` and asserts every ramp step, every status colour and both tier variants against their own bar — reading the stylesheet that ships rather than a list of hexes copied into a test, which is the only version that cannot drift. It also asserts the three ink steps stay visibly distinct, so the fix does not flatten the hierarchy it was protecting.

---

*D35–D37 come from the hardware re-rating (2026-08-17), which began as Mark asking whether `gridPowerKw` was realistic. It was the wrong constant, and answering the question properly moved enough of the model that three separate rulings fell out. D35 amends D10's economic constants; do not read D10's figures without it.*

**D35 — Charger hardware re-rated to current spec; D10's £40k/£50k constants amended.** *(2026-08-17, ratified by Mark)*

`rapid_dc` 50 → **150 kW**, `ultrarapid_dc` 150 → **350 kW**, `slow_ac` unchanged at 22 kW. Grid caps re-sized with them: roadside 350 → **650 kW**, commuter 250 → **450**, destination 300 → **350**.

*Why:* the old pair was 2019–2021 spec and had drifted a full generation behind the model's own fleet. D15 put `maxChargeRateKw` of 60–250 kW on vehicles precisely to keep ultra-rapid bays honest — but a 50 kW "rapid" bay throttled **every** car on site, including the ones D14's taper exists to describe, so `min(bayAllocated, vehicleMax)` was decided by the bay in nearly every case. Current UK classification puts rapid at 100–150 kW (50 kW is the legacy tier) and corridor ultra-rapid at 350–400 kW; GRIDSERVE/Extra and IONITY both run 350 kW+ on the roads this scenario models.

*Why the grid caps did **not** go to the MW range Mark expected:* they shouldn't, at six bays. MW-scale connections are a function of bay count — ~1.5 MVA for a 10–12 × 150 kW hub, and a dedicated 14 MVA substation for the 32-bay Moto Tamworth super hub. **The sizing was measured, not chosen:** with the new bays, throughput climbs to ~650 kW, plateaus by 800, and returns bit-identical runs at 1,100 and 1,300 kW. A connection sized the way the industry actually sizes them (70–83% of the new 1,300 kW nameplate ⇒ 0.9–1.1 MVA) would therefore sit permanently above its own plateau and make `power_choke` unreachable, taking gate criterion 3 with it. 650 kW is 50% of nameplate — a site connected for typical peak rather than absolute peak, which is both the ordinary UK position and the only band where the mechanic lives.

***Amends D10*, which fixes "~£40k charger upgrade, starting capital £50,000".** The upgrade is now a 150 → 350 kW swap, not 50 → 150: **£75,000**, against IONITY's ~€140k all-in greenfield unit. Starting capital rises **£50,000 → £100,000** on all three scenarios, and that is a repair rather than a loosening — at £50k against a £75k upgrade the button was disabled at 00:00 and, on ~£3,500/day, still disabled at 23:59. D10's own consequence (3), "starting capital funds **at most one** major upgrade", had become false: it funded zero. £100,000 funds exactly one with £25,000 left, so D10's consequence (4) — bankruptcy as a live-but-theoretical fail state — survives the buy. **D10's realism commitment is not weakened by this; it is the reason for it.** The £50,000 float was the unrealistic half: no operator runs a six-bay corridor hub on it.

*Consequences:* Calibration §2 re-written; §8's capacity derivation is now stale and is **flagged rather than rewritten**, because it is the derivation the measured table gets checked against and re-deriving it is a deliberate exercise. Nine test expectations updated, all hardcoded old arithmetic — the two *behavioural* power-policy tests passed unchanged throughout, which is the evidence the mechanic survived rather than being re-fitted around. Five sanity-sweep axes re-ranged (they composed a demand multiplier onto a base that now carries its own, and `gridPowerKw`'s old 100–500 range sat entirely on the rising limb, hiding the plateau the axis exists to show). Gate criterion 2 narrowed from three distinct winners to two — still passing, but thinner, and worth watching.

**D36 — Roadside demand raised ×1.8, as the price of D35.** *(2026-08-17, ratified by Mark)* A single `DEMAND_SCALE` constant multiplying every wave's `arrivalRatePerMinute` in `roadsideHub.ts`.

*Why:* D35 roughly halved service time, and a six-bay site that turns cars around twice as fast is under no pressure at all. Measured immediately after the re-rating and before any compensation: **D13's difficulty floor fell 80% → 25%**, avg wait 5.5 → 1.9 sim-min, abandonment 1.8% → 0.1%, trust 56 → 76. The sim had become easier, not more realistic — and D13 is a gate criterion, not a preference.

*Why demand rather than anything else:* the fleet grew alongside the chargers. Corridor traffic in 2026 is not 2019 traffic, and the same industry movement that put 350 kW units on motorways put the cars there to use them. The alternative — clawing difficulty back by constraining the grid further — would have meant sizing the connection at ~27% of nameplate, which is not a real site.

*The window is narrow, which is what makes this a decision and not a free parameter.* Floor by factor, 20 seeds each: ×1.0 **25%** · ×1.2 **20%** · ×1.4 **10%** · ×1.6 **40%** · ×1.8 **80%** · ×2.0 **100%** · ×2.4 **100%**. ×1.8 is the point that restores the floor to exactly D13's bar; ×2.0 and above is a site in permanent collapse (`trust_crash` on 9/20 seeds and rising). **×1.8 is the top of the usable band, not a midpoint.** The dip at ×1.2–×1.4 is real and non-obvious: more demand lifts margin faster than it costs trust, until the queue starts turning people away.

*Consequences:* goals re-fitted on all three scenarios from their measured 20-seed spreads, in the manner OPEN-7 established — **this supersedes OPEN-7's £2,200**, now £2,800, with wait 420 s and sessions 300. `minTrust` deliberately stays at its original **55**: the re-rating moved every other number but not what a good reputation is worth, and at 55 it carries the floor on its own (met on 4/20). Roadside passes at **exactly 80%** with no headroom, where commuter and destination sit at 85% — a single seed flipping puts roadside under, so re-measure before trusting it after any further change. **Accepted risk, recorded:** this is a demand-model change made as a consequence of a hardware change, and it alters what "Junction 42 Services" represents. It is one constant and reverts in one line.

**D37 — Upgrade affordability is a reducer rule, not a UI gate.** *(2026-08-17, ratified by Mark)* `upgrade_charger` refuses an unaffordable request outright — no debit, no spec swap, no latched `pendingUpgradeType` — emitting `charger.upgraded` at `warn` with `applied: false` and `refused: "insufficient_cash"`.

*Why:* the affordability test existed in exactly one place, `BayAvailabilityPanel`, and the reducer had none. It would take a site to −£25,000 and the only thing stopping a player was a greyed-out button. **Every capex test in the suite passed on a purchase the UI would have refused** — which is how D35's £75,000 upgrade came to be unbuyable out of £50,000 with the whole suite green. A rule enforced only by the thing that draws the button is not a rule.

*Why the reducer is authoritative rather than the panel:* actions apply the tick **after** they are issued (C8), so cash can fall between click and reduce. A button that was enabled when pressed is not a promise the money is still there.

*Refused, not clamped and not part-paid* — you cannot half-buy a charger, so there is nothing sensible to do with an unaffordable request except decline it. The decline is a `warn` rather than silence, following the existing no-upgrade-path case: a click that does nothing without saying so is a legibility bug, and legibility is what this build is gated on.

*Consequences:* `canAffordUpgrade` and `upgradePathFor` now live in `selectors.ts` with the panel importing them, so a disabled button and a declined action cannot disagree. The boundary is inclusive (`cash >= capexCost`) and tested on both sides — £74,999 refuses, £75,000 buys. Consistent with D11's paired-schema rule: no new event name, since `charger.upgraded` already carried an `applied: false` form.

**D38 — Gate criterion 2 is judged on separation, not on who came first.** *(2026-08-18, ratified by Mark)* `judgeDominance` no longer counts distinct argmax winners. For each archetype it takes the best strategy and keeps every strategy that is **not measurably worse** — a paired comparison over the shared seeds, ruled out at 2 standard errors. A strategy that survives that on **all three** archetypes is dominant, and only then does the criterion fail.

*Why:* the old test asked "how many distinct strategies come first?", which is an argmax over near-ties and therefore moves with the sample. The same code, unchanged, answered **three distinct winners** at 8 seeds, **two sharing a component** at 10, and **two genuinely distinct** at 40 — and the difference between the last two was a 0.100-goal gap on Kesteven with a paired t of **0.75**. A gate criterion whose verdict is decided by noise is not measuring anything. It also broke exact ties by `STRATEGIES` declaration order and said nothing about having done so, so `preventive` beat `premium+preventive` on a tie for no reason but source position.

*What the criterion actually forbids* is one answer being credible everywhere — that is what "no dominant strategy" means, and it is what the threshold in the scorecard already says in words ("≥2 policy **families** winning on different archetypes"). The coded test and the written threshold had drifted apart and, at 10 seeds, disagreed for the first time. This closes that gap in favour of the written one.

*This is stricter, not looser.* It passes on every dataset the old test passed on, and it additionally refuses to pass on a sample too thin to support the claim. What it stops doing is depending on which of two statistically indistinguishable strategies happened to come first.

*The separation result is solid where the ranking was not.* At 40 seeds: `preventive` tops Junction 42 but sits **0.55 goals** behind on Kesteven and is ruled out there; `premium` tops Kesteven but is **1.15 goals** behind on Junction 42, sixth of seven. Reliability wins where things break and pricing wins where demand is captive — the finding the scorecard already claimed — and that holds regardless of which way the two unresolved ties fall.

*Seed count is now load-bearing, and is measured rather than chosen.* Wide error bars make everything a contender, so an underpowered run drifts toward failure. Measured across the same code: **8 seeds — `premium+preventive` cannot be ruled out on any archetype**; **20 seeds — passes**, but Junction 42 still carries a second contender at t=1.83 and the verdict turns on `premium+preventive` clearing the bar there by a hair; **40 seeds — passes**, with Junction 42's contender set collapsing to `preventive` alone. `MIN_SEEDS_FOR_DOMINANCE` is **40**, being the lowest count measured at which the corridor resolves to a single answer. Below it the verdict prints `INCONCLUSIVE` on a failure and `PASS (provisional)` on a pass, because absence of evidence and evidence of dominance must not print the same word. The archived `gate --seeds 8` convention is under this floor and its output should not be read as a verdict.

*Consequences:* `StrategyScore` carries `goalsMetPerSeed`, since a paired test needs the days, not the averages. `DominanceVerdict` gains `contenders`, `seeds`, `underpowered`, and `tiedWith` on each winner — an exact tie is now reported rather than silently resolved, though it is still declaration order that breaks it. `distinctWinners` survives for reporting only and no longer feeds the verdict. Five unit tests pin the judging itself, which previously had none — dominance detected, separation passed, ties surfaced, a thin sample flagged, and a small-but-perfectly-consistent loss ruled out (zero variance is the strongest evidence available, not the weakest). **`ChargePointOperator_Gate_Scorecard.md` §"Criterion 2" is now stale** — its winners table is an 8-seed run, and its "three distinct winners, one per site" was never robust. It wants re-issuing at ≥40 seeds against this judging.

**D39 — A vehicle that has left is a record, not an agent.** *(2026-08-18, ratified by Mark)* `departVehicle` writes a flat `DepartedVehicle` and deletes the agent from `state.vehicles`, so `vehicles` now means "still on site" and `departedVehicles` is the day's traffic. This replaces `departedVehicleIds`, which was pushed to and never read.

*Why:* `tick` deep-clones the whole state every tick, and a full `VehicleAgent` was retained for every arrival — **420 of them by midnight**, copied 1,440 times, and read by nothing but the invariants. Measured on the roadside hub: per-tick cost across the back three-quarters of the day **1.134 → 0.950 ms (−16%)**, a full run **1,312 → 1,110 ms**, serialised state **296 KB → 190 KB**.

*Nothing changed but the hash.* Twenty seeds against the previous commit: every KPI bit-identical, `finalStateHash` moving on all twenty because `vehicles` is inside `hashState`. That comparison is the evidence the pruned records were genuinely unread, and it is the reason to trust the change rather than the arithmetic above.

*The real risk was not performance, it was the invariants going quiet.* Three checks read terminal vehicles, and deleting those vehicles would have left all three **passing on an empty collection** rather than failing — the worst outcome available, since an empty collection is also what a broken close-out sweep produces. So they are restated as things that can still fail: invariant 5 now also range-checks `finalSoc` on the records (SOC is written up to the last tick, so the departing value is exactly what the old check caught); invariant 7 asserts the two halves of the move — nobody terminal left behind in `vehicles`, nobody in `departedVehicles` without a terminal outcome and a reason; and `checkFinalInvariants` asserts one record per arrival **plus unique ids**, because a count alone cannot see a double-recorded departure masking a missing one. Four tests drive each of those failures deliberately, which is the only way to know a rewritten invariant still bites.

*What the record keeps, and why.* The eleven fields anything reads, plus two chosen rather than inherited: `expectedWaitSeconds`, the *perceived* wait a driver actually judged on (D31) and the one figure no aggregate preserves, and `requestedKwh`, what they wanted as against what they left with. The rest of `VehicleAgent` is arrival-time input that a seeded replay regenerates.

*Consequences:* `finalStateHash` re-bases across every scenario, so the `runs/` artefacts want regenerating again — they are gitignored and reproducible, but the archive is now two changes behind. `mustVehicle` remains dead code and is untouched. Sessions were pruned the same way in the preceding commit; between them the per-tick clone carries roughly half what it did.


**D40 — Losing focus does not pause the day, and neither does hiding the tab announce itself.** *(2026-08-18, ratified by Mark)* No `visibilitychange` or blur handler. `useGameLoop` is left as the sole arbiter of how real time becomes ticks.

*Why this needed saying at all:* the stall fix that preceded it left an open question about what *should* happen when the player looks away, and the answer is "nothing we write". Two cases were being conflated, and only one of them was ever in the code's gift.

**Losing focus** — another window in front, a second monitor, clicking into another app — leaves the tab *visible*. `requestAnimationFrame` keeps firing, so the sim keeps running, and nothing in the build interferes. Worth recording because `visibilitychange` would not have fired here either: the pause that was offered and declined would not have touched this case, so declining it changes nothing about the behaviour Mark asked to keep.

**Hiding the tab** — backgrounding it, minimising the window — stops rAF at the browser's discretion. Ticks stop whatever we do. That is the platform, not a choice, and Dev Log §5 already records it as the reason browser verification of the tick path is awkward.

*So a hidden tab already pauses, implicitly.* Since the debt clamp it also resumes cleanly rather than replaying the missed hours. What was declined is **making that pause visible** — a banner, or an explicit paused state. The argument for it was legibility, which is a gate criterion; the argument against is that it announces a stop the player did not ask for and cannot avoid, and adds a control to un-stick something the browser un-sticks on its own. Mark's call, and the quieter behaviour stands.

*Not settled by this, and not to be read as settled:* **whether the site should keep trading while the tab is hidden.** Today it cannot, because the tick loop is driven by rAF — that is a consequence of the driver, not a design position anyone has taken. Making the day continue unattended would mean moving the loop onto a timer or a worker, which is a real change with its own measurement, and it is the more interesting game. It has simply never been asked.


**D41 — The clock is the only thing that ends a day.** *(2026-08-19, ratified by Mark)* Both hard fail rules are removed. `scenario.failRules` and `checkScenarioOutcome` are gone with them, and D20's `FailRules` type is retired. A run now ends at `durationSeconds` and nowhere else.

*What went:* `bankruptcyCashBelow: 0`, and `trustBelow: 30` sustained for 7,200 sim-seconds. **An unpayable balance and a collapsed reputation are outcomes you trade through and are scored on at close-out, not trapdoors that stop the run.**

*Why, in play:* a site left unrepaired reached trust under 30, sat there for two sim-hours, and was shut down around 20:00 — measured at 4 of 10 seeds under no-repair play, ending between 19:57 and 21:26. The player had been failing since roughly 18:00 and found out two hours later, with four hours of the day removed. The trust-collapse rule fired on reputation every time; **bankruptcy never fired at all**, and could not: D37 refuses any upgrade the site cannot afford, so no action can drive cash below zero. One rule was punishing and late; the other was unreachable.

*This does not weaken the failure model.* `trust_crash` (below 40 and falling) and the `trust_collapse` **alert** are detection, D24, and both survive untouched — the site still says loudly that its reputation is gone, it simply keeps trading. Gate criterion 3 counts detected states and is unaffected. The distinction D24 drew between detection and termination now has only one side left, which is the simpler arrangement it was always heading towards.

*Measured consequences, against the previous commit:* the 20-seed baseline batch is **identical on every KPI** and the D13 difficulty floor is **unchanged at 80%** — the baseline never triggered a fail rule, so nothing about the calibrated difficulty moves. Across 210 strategy runs, **7 ended early and all 7 were `undercut`**; re-run, only `undercut` on Junction 42 changes (1.00 → 1.40 mean goals) and it remains last of seven everywhere. Gate criterion 2's winners, top-three and verdict are **bit-identical**. `finalStateHash` re-bases on every seed, because `failRules` lived inside `scenario` and `scenario` is inside the hash.

*Carried forward, and not settled here:* **running at a genuine cash deficit is still impossible.** Removing the bankruptcy rule removes the punishment, not the barrier — D37's refusal means nothing can spend past zero, and a day's operating costs cannot approach a £100,000 float. If a deficit is meant to be reachable, D37 has to be relaxed so an upgrade can overdraw, and that is a separate decision with its own consequences for what the upgrade lever means.


## Open

**OPEN-4 — Trust deltas are net-positive; trust runs to the ceiling. — `CLOSED 2026-08-16 by D30`** *(raised Phase 1; closed same day)* Baseline trust now ends at 56.4 [49.6 · 62.2], in the calibrated 45–70 band. Original entry, for the record: Measured baseline trust ends at **96.3 mean, 8/20 seeds pinned at 100**, against an expected 45–70. The Calibration §5 deltas sum strongly positive under competent play (~+64/day from completions alone, +12 from the uptime bonus, against roughly −16 of penalties); the rolling ±5 clamp limits the *rate* but never the sign. **Three consequences:** `minTrust` is unscoreable; `trust_crash` is unreachable, putting gate criterion 3 at risk; and — the serious one — `siteScore` carries `+0.3 × (trust − 50)/25`, so at trust 100 every arrival gets **+0.6** rather than the +0.12 the admission formula was calibrated around, inflating acceptance, utilization and sessions. **This is a model change, so it lands here before it lands in the sheet.** Candidate fix (findings §5.1): drop the flat completion bonus to 0, keep only the fast-completion bonus, and raise the uptime-bonus threshold to 98% — leaving trust flat under good operation and falling under bad. Do not simply tighten the clamp; the clamp is a rate limit and the problem is the sign. **Decide before re-setting any goal**, since trust feeds admission and therefore every other number.

**OPEN-5 — Admission is doing abandonment's job; `queue_collapse` is unreachable. — `CLOSED 2026-08-16 by D31`** *(raised Phase 1; closed same day)* `queue_collapse` is now reachable by a plausible mistake and never by the baseline; all five failure states are reachable. The abandonment *rate* stayed low, and D31 records why that expectation — not the sim — was wrong. Original entry, for the record: Measured abandonment is **2.4%** against an expected 8–25%, `site_full` fired **zero times across every run**, and peak queue length with six bays open is 5–6 of a possible 12. Not a bug: A4 (perfect driver information) plus D21 (admission reads per-archetype wait sensitivity) means arrivals see the true projected wait and drive on rather than joining a queue long enough to hurt. The queue is self-limiting, so demand that §7a expected to be shed by *abandonment* is shed at the *gate* instead. `queue_collapse` needs queue pressure ≥ 2.0, which only happens if the player closes bays. **A4 already sanctions the fix** — "add noise to `expectedWait` if admission feels twitchy" — so a multiplicative noise term (≈ ±30%) on the wait each arrival perceives is a tune, not a new mechanic; but it changes the funnel shape materially, so it is recorded as a decision. Resolving this and OPEN-4 together is what makes gate criterion 3 reachable.

**OPEN-6 — Three of the four partial-charge options are no-ops. — `CLOSED 2026-08-16 by D33`** *(raised Phase 1; swept Phase 3)* The sweep shows the mechanic is powerful and well-behaved across its whole range — at ×1.6 demand, off/70/60/50% gives 203/215/265/330 sessions and 30.4/24.9/19.5/12.6 kWh per session — but everything above 0.80 is inert because every driver already targets 0.80 or less. **Two fixes:** re-scope the options to off/0.70/0.60/0.50 (one line, available today), or give driver target SOC real spread of 0.70–0.95 (better design, needs a re-measure of everything downstream of session length). Phase 3 findings §6. *Original entry:* `partialChargeTargetSoc` is offered as off / 0.90 / 0.80 / 0.70, but commuters and en-route drivers both target **0.80** and panic drivers 0.60 — so 0.90 and 0.80 measure **identical to "off" across 20 seeds, to the last decimal**. Only 0.70 does anything, and there the mechanic works exactly as D14 promised (sessions 183 → 200, avg wait 6.1 → 4.9 sim-min, kWh 5,300 → 4,694, margin £1,844 → £1,421 — a real trade). Options: re-scope to 0.80/0.70/0.60, or give driver target SOC per-vehicle variance so the higher caps bite on someone. **Phase 2 wants this answered** — `ChargingPolicyPanel` would otherwise ship a control where three of four settings do nothing, in a build whose gate criterion is legibility.

**OPEN-7 — Win goals re-set from the measured distribution. — `CLOSED 2026-08-16 by Mark` · `SUPERSEDED 2026-08-17 by D36`** *(`minOperatingMargin` £1,750 → £2,000 → **£2,200**, and by D36 → **£2,800**)* The method below still stands and is the one D36 re-applied; only the figures moved, because D35 changed the distribution they were fitted to. **D13's difficulty floor passes for the first time: the baseline fails ≥1 goal on 16/20 seeds (80%).** £2,200 is the lowest round value that works — the six seeds the baseline used to win outright sit at £2,154, £2,190, £2,220, £2,312, £2,506 and £2,772, so anything below £2,190 catches none of them. Goals are scored only at close-out and do not affect the simulation, so the candidate values were scored against the existing seed batch rather than re-run.

*Accepted consequence:* `maxAvgWaitSeconds` and `minSessionsCompleted` still pass on 20/20 and score nothing, so the scorecard is effectively one number. Deliberate — this is a business game and the business number is margin. The measured alternative was `minSessionsCompleted` 110 → 180, which reaches the same floor across two uncorrelated goals; revisit at Phase 4 if playtesters read the other three goals as noise. *Also measured and rejected:* raising the **starting price** to £0.95 passes the floor too, but by wrecking the site (97 sessions served instead of 178, because commuters hard-reject above £0.95) — and the scenario spec's standing rule is to raise a goal, never the economy constants, for difficulty reasons.

Original entry: *(raised 2026-08-16, Phase 1; re-measured after D30/D31)* The prerequisite is now met — OPEN-4 and OPEN-5 have landed and a fresh 20-seed batch has been taken — so this is ready to decide.

**Measured after D30/D31:** the baseline fails ≥1 goal on **60% of seeds** (was 30%) against D13's ≥80%. `minTrust` is no longer decorative: the baseline meets it on 12/20 rather than 20/20, which is D30 doing its job. `minOperatingMargin` bites on 9/20. `maxAvgWaitSeconds` (20/20) and `minSessionsCompleted` (20/20) remain decorative.

| Goal | Current | Baseline meets | Measured p80 | Recommended |
| :-- | :-- | :-- | :-- | :-- |
| `minOperatingMargin` | £1,750 | 45% | £2,196 | **£2,200** — closes the floor on its own |
| `minTrust` | 55 | 60% | 60.8 | leave at 55, or 60 for a second axis |
| `minSessionsCompleted` | 110 | 100% | 188 | 185 if you want it to score anything |
| `maxAvgWaitSeconds` | 480 s | 100% | 366 s | 360 s to make wait a live constraint |

**Raising `minOperatingMargin` to £2,200 alone takes the floor to ~80%.** Still Mark's call — this is a difficulty decision, not a tune, and the scenario spec is explicit that the margin goal is the one to move rather than the economy constants.

**OPEN-1 — Playtesters. — `NOW BLOCKING`** *(parked until Phase 3 wound down; Phase 3 is complete)* Everything except the people is ready: the apparatus, the fixed seeds, the per-run artefacts, the observer's session pack, and three of the five gate criteria already scored and passing. **Phase 4 cannot complete without three external testers, at least one neither a gamer nor an EV person.** Two of the five criteria are irreducibly human and will not be filled any other way. Original entry:

**OPEN-1 — Playtesters (original)** *(renumbered from "O-4" to stop colliding with the Plan's O1–O8 omission series)*. Parked until Phase 3 winds down (per Mark, 2026-08-16). Need 3 externals, ≥1 non-gamer non-EV person (protocol §1). Nudge: start recruiting when the Phase 3 archetype scenarios are playable.

**OPEN-2 — Maintenance-tier dominance. — `CLOSED 2026-08-16 by D33`** *(raised readiness review; measured Phase 1; re-measured and diagnosed Phase 3)*

**Phase 3 verdict:** preventive wins on *every* archetype — corridor £1,057/£1,961/**£2,319**, commuter £560/£839/**£995**, destination £139/£288/**£380** (reactive/standard/preventive, 10 seeds each). It is also the common factor in every winning strategy in the dominant-strategy test, which is what keeps gate criterion 2's pass a technicality.

**The new diagnosis: the dominance is a repair-pricing effect, not an uptime effect.** On the destination site uptime moves only 99.33% → 99.64% while margin nearly triples — at ~2 faults/day, preventive pays £20/day more standing to save ~£100/day of call-outs (£300/£200/£150 per repair). That points at a cheaper fix than the one Phase 1 recommended:

- **Option 2 (new, and cheapest): flatten the per-repair cost across tiers** (~£200 for all three) and let the tiers differ only on fault rate and repair speed. Kills the dominance at its actual source, keeps every standing charge realistic, one-line change. Costs some flavour — cheaper call-outs on a contract is true to life.
- **Option 1 (still the best mechanic): scheduled maintenance windows.** Preventive takes a bay offline on a planned schedule. Costs bay-time, which is the resource this game is about, and bites hardest on quiet sites — exactly where preventive is currently most overpowered. Pairs with A14. Real work.
- **Option 3: reprice the standing charge to ~£460/day.** Works, breaks D10. Not recommended.

Options 1 and 2 are not exclusive; 2 can land now and be superseded by 1 in Phase 5. Full reasoning: Phase 3 findings §5. *Original entry:* Confirmed empirically, 20 seeds per tier: `preventive` returns **£2,300** cumulative margin against `standard`'s **£1,844** and `reactive`'s **£1,230**, while also winning on uptime (98.72 / 97.19 / 96.36), sessions (185 / 183 / 177) and trust. Strictly dominant on every axis — a direct threat to gate criterion 2. Measured break-even standing charge for `preventive` is **£500/day**, i.e. £182k/year on six bays, which is the figure D10's realism commitment refuses. So the framing holds: this is a decision, not a tune. **Phase 1 recommends option (b)** — give `preventive` a real cost in bay-time via scheduled maintenance windows — over (a) balance-over-realism repricing, because the tiers already differ believably on money, bay-time is the resource the game is actually about (and the `mid-lull`/`pm-lull` windows make *when* you service a real decision), and it pairs with A14's unlimited instant repairs, which is the other reason `reliability_spiral` is soft. One mechanic fixes both. Reasoning in full: findings §4. Still a Phase 3 decision — but every sweep that lets maintenance vary will say "preventive" until it lands.

**OPEN-3 — Unvalidated output ranges. — `CLOSED 2026-08-16`** *(raised readiness review; closed by the Phase 1 seed batch)* Calibration §7 now holds measured values with mean and p10/p90 across 20 seeds, per the Phase 1 exit criterion. The derivation in §7a held up (predicted 239 arrivals vs 235 measured; 28.0 kWh/session vs 28.9; 150–190 sessions vs 183). Three figures were materially wrong and each spawned a successor item: abandonment (→ OPEN-5), trust (→ OPEN-4) and the goal thresholds (→ OPEN-7). Utilization came in at 64.9% against a 40–60% guess, but that is downstream of the trust runaway and should be re-measured after OPEN-4 rather than treated as its own problem.

---

*Template for new entries:*

```
**Dnn — Title.** *(date, source)* Decision. *Why:* … *Consequence:* …
```
