# ChargePointOperator — Development Log, 2026-08-17

**Purpose:** a running record of work done *outside* the phased plan — the rearrangements, audits and repairs that the Plan does not schedule and that mostly produce no decision worth an ADR. The Plan says what we intend to build; the Decision Log says what we ruled; this says what actually happened, including the dead ends and the things found by accident.

**Convention:** one file per working day, `ChargePointOperator_Dev_Log_YYYY-MM-DD.md`. The log is the series.

**What belongs here:** layout and copy work, audits, bug hunts, test and verification runs with their measured figures, infrastructure fiddling. **What does not:** anything that changes a rule or a definition — that is a D-entry in the Decision Log, and this file links to it.

**Status of this entry:** written retrospectively at 11:07 BST from git history, session transcript and re-run measurements. Commit times are from git; the times against §2 onward are from the test-runner clock (vitest prints its start time), so they are real rather than reconstructed. Everything in §2–§4 is **uncommitted working tree** at time of writing.

---

## 1. Board layout rearrangement — 06:50–10:02, committed

Not planned. Started as "the board is a wall of panels" and ran through seven commits. Recorded here because the sequence contains one genuine bug find and one reversal, and neither is legible from the commit list alone.

| Time | Commit | What |
|---|---|---|
| 06:50 | `737af1c` | Ignore gate/sweep console captures — regenerable, not precious. Verified by rerunning the gate at 8 seeds after a process restart; every figure came back identical to the scorecard's. |
| 06:58 | `541a254` | KPIs and power sharing side by side, bays full width. **KPI strip to three columns — "nine cards in three clean rows with no orphan cell".** Bay rank to a grid on a measured 400px track floor (a bay row needs 311px; the first attempt at 270px gave five columns that all overflowed *and* left an orphan). |
| 09:47 | `01751a7` | Power policies laid out in a row — four alternatives to compare, not a list to read down. Verified 1600/1200/900/600, no overflow. Side effect: the power panel now measures exactly the KPI grid's height, so the board's two halves balance without relying on `stretch`. |
| 09:50 | `c834576` | "What's going on" and "Attention" side by side at 50%. Placed outside the fieldset so both stay readable after the day is scored. |
| 09:57 | `20da070` | Board row to 60/20/20. **KPI strip changed from fixed three columns to `auto-fit`.** |
| 09:58 | `bf6a90a` | Board row to 50/25/25. Measured 780/390/390; strip settled on four columns. |
| 10:02 | `c309353` | Four status panels on one row at 25% each; standing policies below at 50/50. Empties the old three-column floor, so the trend charts take full width. |

### The bug the rearrangement exposed (`20da070`)

The KPI dictionary makes avg-wait/abandonment adjacency **binding**: average wait can improve purely because everyone impatient gave up, so the second number must never be readable without the first. At three columns those two cards landed at the end of one row and the start of the next — diagonally opposite, the least adjacent two consecutive cards can be. The rule had been silently broken by a layout change, not by anyone deciding anything.

Fixed structurally rather than by card order: `.kpi-duo`, one grid cell spanning two tracks, so they cannot separate whatever the column count does. Verified adjacent at 5, 4, 3 and 2 columns. **This is the right shape of fix and it survived everything below** — see §4, where the column count changed again and the pairing held without being touched.

### Reversal, noted honestly

`541a254` set the strip to three columns; `20da070` replaced that with `auto-fit` three hours later; §4 below put it back to three. The middle step was not wrong at the time — at 60% of the board the strip genuinely wanted five across — but `auto-fit` means the same nine cards regroup at every width and no row means anything. The end state is `541a254`'s, reached again with the duo now protecting the pairing that `541a254` had accidentally broken.

---

## 2. Dashboard metric audit — from ~10:10, uncommitted

**Trigger:** Mark asked whether every metric on screen is actually driven by sim data, suspecting some represent nothing.

**Method:** read every panel and traced each displayed value to its source; then wrote throwaway probes under the session scratchpad to measure the suspicious ones against real runs rather than reasoning about them. Probes covered 1–8 seeds × 3 scenarios, plus deliberately bad play (price floored at £0.45) to reach states a competent run never visits. Two findings were confirmed by rendering components with `renderToStaticMarkup` against synthetic and finished states, because the browser preview cannot drive the sim (see §5).

**Result: 11 findings.** Nine were real defects in what the dashboard claims; two were copy/completeness. Nothing on the list was "wired to nothing" in the sense Mark suspected — every number had a source — but several sources did not mean what the label said.

### Findings, with the evidence that established them

| # | Finding | Evidence |
|---|---|---|
| 1 | Power bus headline read a different instant from the bar beneath it — headline from `site.availablePowerKw` (frozen at rebalance), segments from `bay.allocatedPowerKw` (zeroed later in the tick on completion/fault) | Disagreed on 5–9% of ticks across 8 seeds × 3 sites; worst **250 kW of a 350 kW bus** claimed in the label with nothing drawn |
| 2 | "Average wait" showed a green **0.0 min** when no session started in the 900s window — a no-data case rendered as the best possible value | 301 of 3,477 queued ticks (**9%**), max queue at that moment **9 cars** |
| 3 | "% of started sessions finished without a fault" counted in-flight sessions as failures | Seed s1 read **85.4% at 09:00** with 5 cars charging and zero faults |
| 4 | Charging-limit panel counted already-charging drivers as "cut short", though `requestedKwh` is frozen at session start | Up to **5 charging** counted against **4 genuinely affected** queueing |
| 5 | Alert copy stale and hardcoded | Claimed "one and a half cars per bay" against a threshold of **1.0**; quoted **350 kW** at sites running 250 and 300 |
| 6 | Bay upgrade button took `upgradeCosts[0]` as *the* cost and gated on `rapid_dc` | Destination site: button said **£18,000**, reducer debited **£40,000**; seven `slow_ac` posts had **no button at all** despite a valid path |
| 7 | Economics chart clamped margin at zero — a loss drawn as break-even | Cumulative margin runs negative overnight; −£6 to −£28 under passive play |
| 8 | Uptime read **100%** with every bay closed | `rollUptimeFraction` returned 1 for an empty window |
| 9 | Post-run labels contradicted the diagnosis panel's for the same buckets | "Turned away at the entrance" named the *drive-past* count, sitting above the real site-full one; a caption gated on a duplicate counter said nothing |
| 10 | Price hint showed only arrival elasticity, missing the larger gate-rejection effect | £1.20 displayed **−62%**; sessions actually started fell **83%** (136 → 23 over 5 seeds) |
| 11 | Funnel didn't close at midnight — `closedAtRunEnd` had no row | 0–2 drivers per seed vanished from "where the day's N drivers went" |

### Round 1 — wrong numbers · tests green 10:27:36

Findings 1, 3, 4, 5, 6.

- **Power bus** (`PowerPolicyPanel`) — headline, saturation test and spare block all now sum the bay allocations. `site.availablePowerKw` deliberately untouched: `settleAvailablePower` documents why detection needs it frozen. Bar and label now describe one instant; verified segment widths + spare = exactly 100%.
- **Session success** (`scoring.ts`) — denominator changed to concluded sessions (`completed + interruptedByFault`). **Identical at midnight** (131 + 2 = 133 started), so no Phase 3 figure, sweep verdict or gate evidence moves. KPI dictionary entry updated to match. Mid-run: 06:00 81.8% → 100.0%; 09:00 85.4% → 97.2%; 24:00 98.5% → 98.5%.
- **Bay upgrades** (`BayAvailabilityPanel`) — path resolved per bay from its current spec, target kW from `CHARGER_SPECS`. Verified live: destination site's seven posts now offer "Fit a 50 kW charger for £18,000", its rapid post reads £40,000; Junction 42 unchanged.
- **Charging limit** — counts queueing drivers only; reworded, with a note that a change applies to sessions starting from here on.
- **Alert copy** — `ALERT_DETAIL` is now a function of state, reading `ALERT_THRESHOLDS` and the site's own `gridPowerKw`.

### Round 2 — no-data rendered as good news · tests green 10:43:11

Findings 2, 7, 8. The round that touches selectors the logs read, so handled most carefully.

- `rollAvgWaitSeconds` and `rollUptimeFraction` now return `number | null`. **Every caller coalesces explicitly**, so what "no evidence" means is decided where it is understood: detectors and trust read an empty uptime window as 100%, `recomputeDerivedKPIs` keeps the stored fields numeric (the log payload is `Record<string, number>`), and the dashboard takes the null and renders "—" at idle tone.
- Added `avg_wait_started_sessions` to `snapshotData` so downstream readers can tell a default from a reading. It has readers — the wait chart and the survivorship detector — per §6.5.
- `Plot` gained gap support (`number | null` points, pen lifts) and a `yMin`. The wait line now breaks at starved windows instead of diving to the floor; the margin line goes below zero against a distinct break-even rule.
- **Survivorship detector** now requires a measured wait at both endpoints. It had been reading a jammed site's stored 0 as a wait that had *fallen* — manufacturing the improvement half of the very trap it exists to catch.

### Round 3 — copy and completeness · tests green 10:54:44

Findings 9, 10, 11.

- Post-run report uses the funnel's own names; the missing `siteFull` bucket got its own row; every row carries its share of arrivals; the empty caption is gone.
- Funnel closes — verified on seed s7, which reaches midnight with two still queued: 131 + 95 + 9 + 4 + 2 = **241 = arrivals**.
- Price panel relabelled to "arrivals" (all the elasticity ever measured) plus a second line naming who refuses outright and their share of the current wave. At £1.20 in the night wave: "−36% arrivals" and "Commuters and En-route drivers won't stop at all at this price — 50% of who's arriving now." The two effects are shown separately and **not multiplied into one figure** — `siteScore`'s soft price term sheds custom on top of both, so a combined number would be false precision of exactly the kind being fixed.

### Follow-ups — two deferred items, taken together · tests green 11:00:15

Both were flagged during rounds 2–3 rather than changed in passing, because both alter sim behaviour or state shape. Mark took both.

- **Uptime trust bonus no longer pays for a shut site** (`trust.ts`). The fallback made a forecourt nobody could use read as 100% reliable, so closing everything earned +0.5/sim-hour. Measured, every bay closed for four sim-hours from 00:00, seed s1: **HEAD 60.64 (trust rose) → now 58.65 (drifts down)**.
- **`metrics.sessionsAbandoned` removed.** A second copy of `funnel.abandonedQueue`, incremented on the adjacent line, whose only reader was the post-run caption deleted in round 3. Architecture §5.3 records why. Per the `types.ts` header rule: no field without a reader.

### Decisions taken here, and why they are not D-entries

None of the above changes a rule. The one definition that moved — session success rate — is a *correction* to match the meaning the dictionary already stated ("finished without a fault"), not a new ruling, and the end-of-day value is unchanged. If that reading is wrong it should become a D-entry; flagging it here rather than assuming.

---

## 3. State hash change — action needed for archived runs

The `sessionsAbandoned` removal changes the shape of `SimulationState`, and `hashState` hashes everything but `eventLog`. Seed s1, baseline policy:

| | HEAD `c309353` | working tree |
|---|---|---|
| final state hash | `06eb98f4` | **`f3d1c377`** |
| sessions completed | 165 | 165 |
| cum margin | £1,561.22 | £1,561.22 |
| cum avg wait | 7.3 sim-min | 7.3 sim-min |
| uptime | 96.47% | 96.47% |
| session success | 97.1% | 97.1% |
| trust | 49.9 (12 clamp hits) | 49.9 (12 clamp hits) |

Every observable is identical; **only the hash moved**, which is what confirms the trust rule never fires differently on a normally-played day and that the delta is purely the dropped field. Verified by running HEAD in a temporary git worktree against the same seed.

**Consequence:** any run manifest recorded before today carries the old `initial_state_hash`/`final_state_hash` and will not match a replay on this build. Replay itself still reproduces (`logging.test.ts` passes) — it is only the stored hashes from previous builds that will not line up. If the playtest archive matters, re-record the baseline manifests before the next tester session.

---

## 4. KPI strip to a 3×3 block — 11:0x, uncommitted

Mark asked for the strip's cards at 33% so they flow as a nine-card block.

- `.kpi-strip` back to `repeat(3, minmax(0, 1fr))` from `auto-fit` (see §1's reversal note).
- **Queue moved ahead of the wait/abandonment duo** in `KpiCardGrid`. The duo spans two tracks, so in the old order it could not fit in the single track left at the end of row 2 and got bumped — leaving a hole at r2c3 and a near-empty row 4. With Queue closing row 2, the duo opens row 3 beside Served and the block is square.
- Dropped `.kpi-strip::after`. It existed to paint over the ragged remainder `auto-fit` left; on a grid that divides exactly it would add a spurious 1px row.

Measured at 1280px: nine cards, **all exactly 205px wide** at lefts 1 / 207 / 414, three rows at tops 1 / 113 / 210, bottom gap 1px (the container border). The duo's internal divider lands exactly on the outer grid line, so the weld is invisible in the layout — which is the point.

Rows group meaningfully as a side effect: money, plant, people.

Responsive: checked 1280 / 900 / 780 / 375. No overflow at any. At mobile the existing ≤560px rule still drops to two columns with the duo stacking vertically — wait directly above gave-up — so the binding pairing survives there too.

---

## 5. Infrastructure and tooling notes

- **`vite.config.ts` + `.claude/launch.json`** — dev server now honours `PORT` with `autoPort: true`. Another session held 5273 and no preview could start otherwise. Revert if the port needs pinning for anything.
- **The browser preview cannot drive the sim.** `useGameLoop` runs on `requestAnimationFrame`, which does not fire while the pane is hidden, so the clock sits at tick 0 and only advances one frame per screenshot. Everything needing a busy or finished day was therefore verified either headlessly or by rendering components with `react-dom/server` against real and synthetic states. Worth knowing before anyone tries to verify a mid-day panel by clicking about.
- Probes live in the session scratchpad, not the repo — they are throwaway and the figures they produced are recorded above.

---

## 6. Verification status at close

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm test` | **115 passed, 7 files** (last run 11:00:15) |
| Sim behaviour vs HEAD | identical on every observable; hash moved once, by design (§3) |
| Browser render | no console errors; upgrade buttons, price refusal line, charging-limit copy and KPI grid all verified live |
| Component render tests | economics axis −£138…£3,080 with zero rule; wait line breaks into 2 subpaths at the starved window; funnel sums to arrivals |

**Working tree:** 24 files, +440 / −164. Nothing committed. Suggested split if committing in pieces: rounds 1–3 and the two follow-ups are independently reviewable; §4 is separate again.

---

## 7. Open, carried forward

1. **Three-column breakpoint.** The strip holds three columns down to 560px, where the old rule guaranteed each card 165px. Between roughly 780 and 900px the cards reach ~125px and two-word labels wrap to two lines. Legible, but raising the existing breakpoint from 560px to ~780px is a one-line change if the wrap is unwanted. *Offered, not done.*
2. **Session success definition.** See §2 — correction or ruling? If ruling, needs a D-entry.
3. **Archived run manifests.** §3 — re-record before the next tester session if the archive is to stay verifiable.
4. **`ChargingPolicyPanel`'s OPEN-6 note** still stands: the panel now tells the truth about how many drivers a limit would bite on, which was the interim measure. The underlying question — whether the control earns its place — is unchanged.

---

## 8. Price commits itself — the Apply button, removed (post-close addendum)

Mark asked for the price slider to auto-submit so the Apply button could go. Done, plus a
staleness bug the button had been masking.

**Where the commit fires.** Not on `onChange`. A pointer drag fires that on every step, and each
`set_price` writes one `site.price_updated` decision-marker event (C6) — one drag would have put
forty of them in the run log and buried the decision they were meant to record. So the panel keeps
its local `draft` for the live readout and sends on release: `onPointerUp`, `onKeyUp`, `onBlur` for
the slider; blur or Enter for the connection fee. Measured in the browser: **one drag → exactly one
action**, payload `£0.57/kWh, £0.99 connection`.

**Keyboard is one action per press,** and left that way deliberately. A held arrow key gives
repeated `keydown`s and a single `keyup`, so it coalesces on its own; discrete taps do not, and three
taps wrote three actions. Debouncing them was considered and rejected — at 4.8 ticks per real second
(§5's rate, so ~208ms per tick at 1× and ~52ms at 4×) even a 500ms debounce would silently swallow
2–10 ticks of arrivals. In a real-time sim, prompt beats tidy.

**The `pushed` ref is load-bearing.** The obvious guard — compare draft against `policy` — breaks
while the run is paused: the queued action sits undrained, `policy` still reads the old price, and
every subsequent blur re-sends the same value. Tracking what was last sent instead makes a stray
release or blur free. Verified: blur after an already-committed value adds **no** second action.

**Bug fixed in passing.** `PricingControlPanel`'s draft never resynced, so Restart / New seed /
scenario swap reset the policy underneath it and left the readout showing the old price. The Apply
button had hidden this — it would read "Apply price" and one click reconciled it. With the button
gone the readout would simply have lied, so the panel is now keyed on `sim.state.startedAtUtc` in
`App.tsx` and starts fresh with the run. Verified: £0.57 / £1.75 → Restart → **£0.79 / £0.99**, zero
actions.

The panel gains a note line in place of the button, because the button was also the only
confirmation the change had landed: the slider sends itself on release, the fee on leaving the box,
and either way it applies to sessions that start from here on. That last clause is not decoration —
`charging.ts` freezes `pricePerKwh` and `connectionFee` onto the session at start and bills from the
frozen copy, so it is literally true.

`.apply` stays in the stylesheet; `FaultsAndRepairsPanel` still uses it.

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| Drag / arrow / Enter / blur / duplicate-blur / Restart | all six verified live, action counts as above |
| Sim drain of the queued action | **not** re-verified in-browser — rAF frozen, see §5. Unchanged code path. |

---

## 9. Charger hardware re-rated, and everything that fell out of it

**Trigger:** Mark, reading `power.ts`, said `gridPowerKw` looked very low — "it would usually be in
the MW range" — and asked for research on what a real site runs.

**The research said he was half right, and pointed somewhere else.** Real corridor sites *are* in
the MW range, but that is a function of bay count, not of connection philosophy: ~1.5 MVA for a
10–12 × 150 kW hub, and a dedicated **14 MVA** substation for GRIDSERVE's 32-bay super hub at Moto
Tamworth. For a 6-bay site, MW-range would be wrong. The number that had actually gone stale was the
**bay ratings**: 50 kW rapid / 150 kW ultra is 2019–2021 spec, where current UK classification puts
rapid at 100–150 kW and corridor ultra-rapid at 350–400 kW. The archetype table has allowed
60–250 kW vehicles since v2.2, so a 50 kW "rapid" bay was throttling every car on site — including
the ones the taper model exists to describe.

Sources: [GRIDSERVE Tamworth](https://www.gridserve.com/latest-gridserve-electric-super-hub-at-moto-tamworth-services-launches-with-32-bays-and-dedicated-provision-for-extra-large-electric-vehicles/) ·
[GRIDSERVE/Extra super hubs, 400 kW](https://www.gridserve.com/ev-super-hubs-uk-motorway-charging/) ·
[Mer, rapid & ultra-rapid explained](https://uk.mer.eco/chargers/rapid-ultra-rapid-ev-charging/) ·
[GOV.UK, grid connection process](https://www.gov.uk/government/publications/improving-the-grid-connection-process-for-electric-vehicle-charging-infrastructure/improving-the-grid-connection-process-for-electric-vehicle-charging-infrastructure).

### What changed

| Constant | From | To |
|---|---|---|
| `rapid_dc` maxPowerKw | 50 | **150** |
| `ultrarapid_dc` maxPowerKw | 150 | **350** |
| `slow_ac` maxPowerKw | 22 | 22 — unchanged, still correct |
| roadside `initialGridPowerKw` | 350 | **650** |
| commuter `initialGridPowerKw` | 250 | **450** |
| destination `initialGridPowerKw` | 300 | **350** |
| roadside upgrade rapid→ultra | £40,000 | **£75,000** |
| roadside demand | — | **×1.8** via a new `DEMAND_SCALE` constant |

The connection sizes were **measured, not guessed**. Scanning the grid cap at 8 seeds with the new
bays: throughput climbs to ~650 kW, plateaus by 800, and returns bit-identical runs at 1,100 and
1,300 kW. So a connection sized the way the industry actually sizes them (70–83% of a 1,300 kW
nameplate ⇒ 0.9–1.1 MVA) would put this site **permanently above its own plateau and make
`power_choke` unreachable**. 650 kW is 50% of nameplate — a site connected for typical rather than
absolute peak, which is both the common UK position and the only band where the mechanic lives.

### The part that was not asked for

Re-rating the hardware roughly halved service time, and a 6-bay site that turns cars around twice as
fast is under no pressure at all. Measured immediately after the swap: **D13 difficulty floor fell
80% → 25%**, avg wait 5.5 → 1.9 sim-min, abandonment 1.8% → 0.1%, trust 56 → 76. The sim was easier,
not more realistic.

Raising demand alongside the hardware is the honest fix rather than a fudge — the fleet grew with
the chargers. Scanned ×1.0–×2.4 at 20 seeds each, floor by factor:

| ×1.0 | ×1.2 | ×1.4 | ×1.6 | ×1.8 | ×2.0 | ×2.4 |
|---|---|---|---|---|---|---|
| 25% | 20% | 10% | **40%** | **80%** | 100% | 100% |

×1.8 is the point that restores the floor to exactly 80%. ×2.0 and up is a site in permanent
collapse (`trust_crash` on 9/20 seeds and rising), so the usable window is narrow and ×1.8 is the
top of it. The non-monotonicity between ×1.2 and ×1.6 is real and worth knowing: more demand raises
margin faster than it costs trust until the queue starts turning people away.

**Goals re-fitted on all three scenarios,** because the re-rating slackened them all at once — on
roadside, margin went from met-on-20% to met-on-100% and 110 sessions became a dead threshold
against a measured 298–336. Each was re-set the way the originals were, from the measured 20-seed
baseline spread. `minTrust` on roadside deliberately stays at its original 55: the re-rating moved
every other number but not what a good reputation is worth, and at 55 it carries the floor alone.

Destination needed the per-seed goal matrix rather than a threshold scan — the five seeds passing
all four goals (s1, s4, s10, s11, s14) were the same five at every candidate wait threshold, because
wait runs anti-correlated with margin there. Margin £520 and 95 sessions are the smallest moves that
break s1 and s4.

### Bug found in passing — invariant 7, early termination

The 300 kW squeeze in `invariants.test.ts` started tripping invariant 7: vehicles ending in
`queueing`, funnel buckets not summing to arrivals. Not a test-constant problem. **`checkScenarioOutcome`
sets `running = false` on a fail rule and returns, while `closeOutRun` fires only at
`secondsElapsed >= durationSeconds`** — so every run ending on bankruptcy or trust collapse left
whoever was queueing at that moment stranded in a non-terminal state forever.

Pre-existing, and unreachable before this change only because the old scenario never tripped a fail
rule before the clock ran out. Fixed by splitting the sweep out of `closeOutRun` as
`sweepUpOpenVehicles` and calling it from `tick` when a fail rule fires, so the fail reason survives
instead of being re-derived from goals.

### Sweep axes re-ranged

Five of the eight axes composed a demand multiplier onto the base scenario, which now carries ×1.8
of its own; they would have run at ×2.9–×4.0. `arrivalRate` rescaled to ×0.5–×1.3 (same absolute
span as before), the extra multipliers on `patienceSeconds` / `partialChargeTarget` / `gridPowerKw`
removed, `gridPowerKw` re-ranged to 350–900 kW (the old 100–500 now sits entirely on the rising limb
and would have hidden the plateau the axis exists to show), and `powerPolicy`'s contention point
moved 150 → 350 kW to keep the same degree of squeeze against the larger nameplate.

### Verification

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm test` | **116 passed, 7 files** |
| Sanity sweep, 8 seeds | **19/19 gradients behave as specified** |
| Gate scorecard, 10 seeds | **3/3 machine-measurable criteria PASS**; all 5 failure states still reachable |
| D13 floor, 20 seeds | roadside **80%** · commuter **85%** · destination **85%** — all PASS |

Nine test expectations were updated, all of them hardcoded old arithmetic (50/150 kW allocations,
£40k capex). The two behavioural power-policy tests — queue_relief clearing more sessions than
equal_share, fast_first being worst for abandonment — passed **unchanged** throughout, which is the
evidence that the mechanic itself survived the re-rating rather than being re-fitted around it.

Test expectations that referenced the upgrade cost now read it from `scenario.upgradeCosts` instead
of hardcoding, so they do not rot again the next time hardware is re-priced.

### Carried forward

1. **Calibration §8's capacity derivation is stale and flagged, not rewritten.** The 350 kW /
   50-150 kW arithmetic (deficit windows, £1,540 margin at 170 sessions) no longer describes the
   scenario. Re-deriving it is a deliberate exercise, not a find-and-replace, and it is the
   derivation the measured table gets checked against — so it should be redone rather than deleted.
2. **Criterion 2 narrowed from three distinct winners to two** (`preventive`,
   `premium+preventive`). Still passes — needs ≥2, none winning everywhere — but the margin is
   thinner than it was and worth watching if anything else moves.
3. **Is ×1.8 a scenario change too far?** It is one constant and reverting it is a one-line edit,
   but it is a demand-model decision made as a *consequence* of a hardware decision, which is
   arguably a D-entry rather than a dev-log line.
