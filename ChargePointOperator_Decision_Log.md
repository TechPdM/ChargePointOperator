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

**D10 — Realistic £ economics.** *(ratified by Mark 2026-08-16, amended from the proposed play-scaled option)* Real-world magnitudes: ~£0.79/kWh price, ~£0.28 energy cost, ~£40k charger upgrade, **starting capital £50,000**. *Why:* Mark chose realism over play-scaling. *Consequences (what makes it workable):* (1) the win goal changes from a cash floor to **minimum cumulative operating margin** — a £50k float makes "end richer than you started" meaningless; (2) capex is judged **operationally** (throughput/wait/trust improvement), never by in-run payback — real capex pays back in months, and D12's margin-excludes-capex ruling is what stops an upgrade tanking the scored metric; (3) starting capital funds **at most one** major upgrade, making it a genuine commitment; (4) bankruptcy (cash < £0) is retained as a theoretical fail state only. Assumption A8 rewritten.

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

## Open

**OPEN-4 — Trust deltas are net-positive; trust runs to the ceiling. — `CLOSED 2026-08-16 by D30`** *(raised Phase 1; closed same day)* Baseline trust now ends at 56.4 [49.6 · 62.2], in the calibrated 45–70 band. Original entry, for the record: Measured baseline trust ends at **96.3 mean, 8/20 seeds pinned at 100**, against an expected 45–70. The Calibration §5 deltas sum strongly positive under competent play (~+64/day from completions alone, +12 from the uptime bonus, against roughly −16 of penalties); the rolling ±5 clamp limits the *rate* but never the sign. **Three consequences:** `minTrust` is unscoreable; `trust_crash` is unreachable, putting gate criterion 3 at risk; and — the serious one — `siteScore` carries `+0.3 × (trust − 50)/25`, so at trust 100 every arrival gets **+0.6** rather than the +0.12 the admission formula was calibrated around, inflating acceptance, utilization and sessions. **This is a model change, so it lands here before it lands in the sheet.** Candidate fix (findings §5.1): drop the flat completion bonus to 0, keep only the fast-completion bonus, and raise the uptime-bonus threshold to 98% — leaving trust flat under good operation and falling under bad. Do not simply tighten the clamp; the clamp is a rate limit and the problem is the sign. **Decide before re-setting any goal**, since trust feeds admission and therefore every other number.

**OPEN-5 — Admission is doing abandonment's job; `queue_collapse` is unreachable. — `CLOSED 2026-08-16 by D31`** *(raised Phase 1; closed same day)* `queue_collapse` is now reachable by a plausible mistake and never by the baseline; all five failure states are reachable. The abandonment *rate* stayed low, and D31 records why that expectation — not the sim — was wrong. Original entry, for the record: Measured abandonment is **2.4%** against an expected 8–25%, `site_full` fired **zero times across every run**, and peak queue length with six bays open is 5–6 of a possible 12. Not a bug: A4 (perfect driver information) plus D21 (admission reads per-archetype wait sensitivity) means arrivals see the true projected wait and drive on rather than joining a queue long enough to hurt. The queue is self-limiting, so demand that §7a expected to be shed by *abandonment* is shed at the *gate* instead. `queue_collapse` needs queue pressure ≥ 2.0, which only happens if the player closes bays. **A4 already sanctions the fix** — "add noise to `expectedWait` if admission feels twitchy" — so a multiplicative noise term (≈ ±30%) on the wait each arrival perceives is a tune, not a new mechanic; but it changes the funnel shape materially, so it is recorded as a decision. Resolving this and OPEN-4 together is what makes gate criterion 3 reachable.

**OPEN-6 — Three of the four partial-charge options are no-ops. — `CLOSED 2026-08-16 by D33`** *(raised Phase 1; swept Phase 3)* The sweep shows the mechanic is powerful and well-behaved across its whole range — at ×1.6 demand, off/70/60/50% gives 203/215/265/330 sessions and 30.4/24.9/19.5/12.6 kWh per session — but everything above 0.80 is inert because every driver already targets 0.80 or less. **Two fixes:** re-scope the options to off/0.70/0.60/0.50 (one line, available today), or give driver target SOC real spread of 0.70–0.95 (better design, needs a re-measure of everything downstream of session length). Phase 3 findings §6. *Original entry:* `partialChargeTargetSoc` is offered as off / 0.90 / 0.80 / 0.70, but commuters and en-route drivers both target **0.80** and panic drivers 0.60 — so 0.90 and 0.80 measure **identical to "off" across 20 seeds, to the last decimal**. Only 0.70 does anything, and there the mechanic works exactly as D14 promised (sessions 183 → 200, avg wait 6.1 → 4.9 sim-min, kWh 5,300 → 4,694, margin £1,844 → £1,421 — a real trade). Options: re-scope to 0.80/0.70/0.60, or give driver target SOC per-vehicle variance so the higher caps bite on someone. **Phase 2 wants this answered** — `ChargingPolicyPanel` would otherwise ship a control where three of four settings do nothing, in a build whose gate criterion is legibility.

**OPEN-7 — Win goals re-set from the measured distribution. — `CLOSED 2026-08-16 by Mark`** *(`minOperatingMargin` £1,750 → £2,000 → **£2,200**)* **D13's difficulty floor passes for the first time: the baseline fails ≥1 goal on 16/20 seeds (80%).** £2,200 is the lowest round value that works — the six seeds the baseline used to win outright sit at £2,154, £2,190, £2,220, £2,312, £2,506 and £2,772, so anything below £2,190 catches none of them. Goals are scored only at close-out and do not affect the simulation, so the candidate values were scored against the existing seed batch rather than re-run.

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
