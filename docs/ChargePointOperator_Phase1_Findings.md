# ChargePointOperator — Phase 1 Findings (Headless Sim Core)

**Version:** 1.1 · **Date:** 2026-08-16 *(v1.1: OPEN-4 and OPEN-5 closed by D30/D31 — §5.1, §5.2 and §5.3 annotated with the resolution and the re-measured numbers)*
**Companions:** `ChargePointOperator_Plan.md` §6.4 (Phase 1 exit criteria) · `ChargePointOperator_Calibration.md` §7/§7a · `ChargePointOperator_Decision_Log.md` (OPEN-2, OPEN-3)
**Status:** Phase 1 build complete. Exit criteria met. Four items needed a decision; **two are now closed** — OPEN-4 by D30 and OPEN-5 by D31, both after this note was written. The sections below are left as they were found, each with a resolution box, because the reasoning that led to the fix is worth more than a tidied-up version of it.

---

## 1. What was built

The headless sim core, in the build order Part L specified: `types.ts` → `tick.ts`/`reducer.ts` → systems → headless runs. No UI.

| Deliverable | Where |
| :-- | :-- |
| Canonical data model (Arch §5) | `src/game/core/types.ts` |
| Determinism contract (D26) — mulberry32, FNV-1a, canonical JSON, fixed timestep | `src/game/core/rng.ts` |
| Calibration constants (sheet v2.2, in code) | `src/game/core/calibration.ts` |
| Tick pipeline in the load-bearing order (Arch §4.1) | `src/game/core/tick.ts` |
| 12 systems — arrivals, admission, queue, power, charging, faults, economics, trust, scoring | `src/game/systems/` |
| The seven canonical actions, with latched close/upgrade (D19) | `src/game/actions/playerActions.ts` |
| Roadside hub scenario (spec v2.2) | `src/game/scenarios/roadsideHub.ts` |
| NDJSON logging, run manifest, replay-from-log | `src/game/logging/` |
| Nine invariants, failure-state detection (D24), trace mode | `src/game/validation/` |
| Baseline actor (D22), run summaries, played-vs-baseline comparison | `src/game/experiment/` |
| Headless CLI — `run`, `batch`, `trace`, with policy overrides | `src/game/headless.ts` |

**87 tests, all passing.** They are written to pin formulas to the documents that define them, so a silent retune shows up red rather than as a mystery in the next seed batch. Notably: the Calibration §5 worked example (commuters walk at ~9 sim-min, en-route ~27, panic ~102) is asserted directly.

### Exit criteria

| Criterion (Plan §6.4) | Result |
| :-- | :-- |
| Roadside hub runs headless to completion | ✅ 1,440 ticks, 20/20 seeds |
| Same seed ⇒ same final state hash (D26) | ✅ invariant 9, incl. tick-by-tick `rngState` equality |
| All nine invariants hold across a seed batch | ✅ 8 seeds under `throw` mode, every tick |
| NDJSON export loads and replays | ✅ **and it replays from the log alone** — the action stream is reconstructed from decision markers and lands on the same hash |
| ≥20-seed batch run; Calibration §7 replaced by measured values | ✅ §2 below — closes **OPEN-3** |
| D13 difficulty floor verified | ✅ verified, and it **fails** — see §3 |
| OPEN-2 recommendation backed by measured fault rates | ✅ §4 |

---

## 2. Measured baseline — OPEN-3 closed

20 seeds (`s1`–`s20`), baseline policy per D22: £0.79 flat, `standard` maintenance, `equal_share`, all bays open, partial-charge off, no upgrades, `schedule_repair` on the tick a fault is detected.

| KPI | Expected (§7, first guess) | **Measured** mean [p10 · p90] | Verdict |
| :-- | :-- | :-- | :-- |
| Arrivals/day | 239 (derived) | **235** [215 · 256] | ✅ derivation sound |
| Sessions completed | 150–190 | **183** [174 · 197] | ✅ top of band |
| Utilization | 40–60% | **64.9%** [62.4 · 68.5] | ⚠ above band |
| Avg wait | 3–10 sim-min | **6.1** [5.4 · 7.1] | ✅ |
| Abandonment | 8–25% | **2.4%** [1.1 · 3.7] | ❌ far below — see §5 |
| Uptime | 94–98% | **97.19%** [95.64 · 98.76] | ✅ |
| Session success | ≥90% | **97.7%** | ✅ |
| Cum operating margin | £1,300–£1,800 | **£1,844** [£1,226 · £2,436] | ⚠ above, and far wider |
| End cash | £51,300–£51,800 | **£51,844** — reconciles exactly | ✅ invariant 6 |
| End trust | 45–70 | **96.3** [88.7 · 100] | ❌ badly wrong — see §5 |
| Faults/day | 4.4 (assumed) | **4.35** [2.0 · 7.1] | ✅ fault model is well-formed |

**The mean-vs-spread warning in §7a was justified.** Margin's p10–p90 spans £1,226–£2,436 — a £1,200 swing on seed alone. Any goal set near the middle of that is a coin flip, which is exactly what §3 shows.

Two derived figures are worth keeping: mean **28.9 kWh/session** delivered (vs 28.0 derived) and **43 rejections at the gate** per day, against **0** turned away by a full queue.

---

## 3. D13 difficulty floor — currently **FAILS**

> *The baseline must fail ≥1 win goal on ≥80% of seeds.*

**Measured: 30%.** The baseline is a perfectly good operator of this site.

| Goal | Value | Baseline meets it on |
| :-- | :-- | :-- |
| `minOperatingMargin` ≥ £1,750 | 14/20 (70%) | the only goal that bites at all |
| `maxAvgWaitSeconds` ≤ 480 s | 20/20 (100%) | measured max 7.6 sim-min vs an 8-min goal |
| `minTrust` ≥ 55 | 20/20 (100%) | measured min 84.7 — decorative |
| `minSessionsCompleted` ≥ 110 | 20/20 (100%) | measured min 174 — decorative, as §7 predicted |

**Recommendation (needs Mark's call — this is a goal change, not a tune).** The scenario spec's own instruction is "raise `minOperatingMargin` or `minTrust` first; don't touch the economy constants for difficulty reasons." From the measured distribution:

- `minOperatingMargin` **£1,750 → £2,300** (the measured p80). One change, and the floor is met on the intended goal, with the intended message: *a passively-run site is a mediocre business.*
- `minSessionsCompleted` **110 → 190** (measured p80) if you want a second axis of tension. §7 guessed ~160; measurement says 190.
- `maxAvgWaitSeconds` **480 → 360** (≈ p50) would make wait a live constraint rather than a backstop.
- `minTrust` should not be re-set until the trust model is fixed (§5.1). Any value below 84 is decorative; any value above it is arbitrary.

---

## 4. OPEN-2 — maintenance-tier dominance, now measured

Three 20-seed batches, identical except for the maintenance level.

| Tier | Faults/day | Uptime | Sessions | **Cum margin** | Trust |
| :-- | :-- | :-- | :-- | :-- | :-- |
| `reactive` | 4.80 | 96.36% | 177 | **£1,230** | 94.5 |
| `standard` | 4.35 | 97.19% | 183 | **£1,844** | 96.3 |
| `preventive` | 2.75 | 98.72% | 185 | **£2,300** | 98.3 |

**Confirmed: `preventive` is strictly dominant.** It is £456/day *better* on margin than `standard` and better on uptime, throughput and trust simultaneously. Calibration §4a predicted this from first-guess arithmetic; the sim agrees to within ~£20/day.

The measured break-even standing charge for `preventive` is **≈ £500/day** (£45 current + £456 of advantage), i.e. £182k/year on a six-bay site. That is the number D10's realism commitment refuses, so §4a's framing holds: **this is a decision, not a tune.**

**Recommendation: option (b) — give `preventive` a real cost in bay-time** (scheduled maintenance windows that take a bay offline), rather than option (a) balance-over-realism repricing. Three reasons the measurement adds: (1) the tiers already differ believably on *money*, so distorting the money is the change that would read as fake; (2) bay-time is the resource this game is actually about, and the site has spare capacity in exactly the windows (`mid-lull`, `pm-lull`) where a maintenance window would hurt least — that makes *when* you service a real decision rather than a menu pick; (3) it pairs with A14 (unlimited instant repairs), which is the other reason `reliability_spiral` is currently soft. Both are one mechanic.

Until this lands, **every sweep that lets maintenance vary will say "preventive"**, and gate criterion 2 is exposed.

---

## 5. Findings the plan did not anticipate

### 5.1 Trust runs away to the ceiling — the most significant finding

Baseline trust ends at **96.3 mean**, and **8 of 20 seeds finish pinned at 100**. Expected was 45–70.

The deltas in Calibration §5 are net-positive by a wide margin under competent play. Per day: ~183 completions at +0.1, most of them also collecting the +0.3 fast-completion bonus (avg wait is 6 min, the bonus threshold is 5) ≈ **+64**; sustained-uptime bonus ≈ **+12**; against ~4 abandonments (−6), ~4 mid-session faults (−8) and 43 price rejections (−2). The ±5 rolling clamp slows the climb but never reverses it.

Three consequences, in order of seriousness:

1. **Trust feeds back into admission.** `siteScore` carries `+0.3 × (trust − 50) / 25`, so at trust 100 every arrival gets **+0.6** instead of the +0.12 the design was calibrated around. That is a large thumb on the acceptance scale, and it inflates arrivals, utilization (64.9% vs the 40–60% band) and sessions. **The utilization and session figures in §2 are partly an artefact of this.**
2. `minTrust` is unscoreable, and `trust_crash` is unreachable by play — which puts gate criterion 3 at risk (§5.3).
3. Trust as a *resource you can lose* — the whole point of it being persistent state rather than a KPI (C7) — does not currently exist.

**Recommendation:** this is a model change, so decision log first (**OPEN-4**). The cheapest defensible fix is to make the positive deltas the *exception* rather than the norm: drop the flat `completion` bonus to 0 and keep only the fast-completion bonus, and gate the uptime bonus on ≥98% rather than ≥95%. That leaves trust roughly flat under good operation and falling under bad — which is what "reputation" is supposed to mean. Do not simply lower the clamp: the clamp is a rate limit, and the problem is the sign.

> **RESOLVED — D30.** Broadly as recommended, plus one thing this note missed: **a long wait cost nothing**. Trust only moved on a *wait* when someone gave up, so a site with 20-minute queues that everyone tolerated lost no reputation at all. A `slowCompletionPenalty` of −0.05 closes that, and the price-rejection penalty went to −0.15 — 23% of the day's demand leaves at the gate, which is a reputation event rather than a rounding error. **Measured after: 56.4** [p10 49.6 · p90 62.2], in the 45–70 band. `minTrust` is now a live goal and `trust_crash` is reachable.

### 5.2 Admission is doing abandonment's job

Abandonment measured 2.4% against an expected 8–25%, and `site_full` fired **zero times in every run**. Peak queue length with all six bays open is 5–6 against a capacity of 12.

The cause is not a bug — it is A4 (perfect driver information) meeting D21 (admission reads per-archetype wait sensitivity). Every arrival sees the true projected wait and drives on rather than joining a queue long enough to be painful. The queue is self-limiting, so the demand that §7a expected to be shed *by abandonment* is shed *at the gate* instead. Both are "lost drivers", and the funnel accounts for them correctly — but they are different mechanics with different levers, and only one of them is currently doing any work.

**Recommendation (OPEN-5):** A4 already sanctions the fix — *"add noise to `expectedWait` if admission feels twitchy."* A multiplicative noise term on the projected wait each arrival sees (say ±30%) would let some drivers misjudge and join a queue they then abandon, which is both more realistic and the only way the queue-management half of the game gets exercised. This is a one-line mechanic with a calibrated constant, so it is a tune — but it changes the funnel shape materially, so it should be a recorded decision.

> **RESOLVED — D31, but not the way this section predicted.** The noise (±35%) went in and barely moved abandonment: 2.4% → 1.8%. **The diagnosis here was half right.** Admission *is* shedding the demand, but that is correct behaviour, not a bug — with drivers who can see a queue and leave, a competently-run six-bay site does not generate mass abandonment, and the funnel accounts for the loss at the gate instead. The 8–25% expectation predates D21 and is now recorded as a superseded guess.
>
> What actually made `queue_collapse` unreachable was **measurement, not behaviour**: its abandonment arm read a 900-second window that swings 0%↔50% every time a session starts, and a single tick's dip reset the whole 30-minute sustain clock. Fixing both — read the arm over the sustain window, and tolerate a 300 s lapse — plus setting the pressure threshold from the joint distribution (0 ticks under baseline at every combination tried; 44 ticks at ≥1.0/≥30% under a price cut) made it fire. **The lesson is the one OPEN-3 already taught: set thresholds from a measured distribution, not from a plausible-sounding number.**

### 5.3 Gate criterion 3 is at risk: only 2 of 5 failure states arise naturally

Across the 20-seed baseline batch: `power_choke` 13/20 seeds, `reliability_spiral` 10/20. Nothing else.

| State | Reachable today? |
| :-- | :-- |
| `power_choke` | ✅ naturally, on the scenario's own 350 kW cap |
| `reliability_spiral` | ✅ naturally (and easily once repairs are neglected) |
| `margin_trap` | ✅ but only by play — it needs `upgrade_charger` plus the paired baseline comparison |
| `queue_collapse` | ❌ **unreachable with all six bays open.** Pressure tops out near 1.0 against a 2.0 threshold (see §5.2). It only becomes reachable if the player closes bays, which shrinks the denominator |
| `trust_crash` | ❌ unreachable by play while trust climbs to 100 (§5.1) |

Criterion 3 needs ≥4 of 5. **Fixing §5.1 and §5.2 fixes criterion 3**; nothing else needs to change. Both detectors themselves are verified working — the tests drive each one into its conditions directly.

> **RESOLVED — D30/D31. All five are now reachable.** The baseline still shows only `power_choke` (17/20 seeds) and `reliability_spiral` (11/20), which is correct — it is a competent operator and should not be collapsing. Cutting the price to £0.45, the classic "I'll attract customers" mistake, produces `queue_collapse` **and** `trust_crash` alongside them; neglecting repairs produces `reliability_spiral` and `trust_crash`; `margin_trap` needs the paired baseline and is asserted in `compareRuns`. There is now a regression test that fails if any of the four in-sim states stops being reachable.

### 5.4 Three of the four partial-charge options do nothing

`partialChargeTargetSoc` is offered as off / 0.90 / 0.80 / 0.70 (Calibration §3). Both commuters and en-route drivers already target **0.80**, and panic drivers target 0.60 — so **0.90 and 0.80 are exact no-ops**, measured identical to "off" across 20 seeds, to the last decimal.

At 0.70 the mechanic works exactly as D14 promised:

| | off | 0.70 |
| :-- | :-- | :-- |
| Sessions completed | 183 | **200** |
| Avg wait | 6.1 min | **4.9 min** |
| Abandonment | 2.4% | 1.4% |
| kWh delivered | 5,300 | 4,694 |
| Cum margin | £1,844 | **£1,421** |
| Trust | 96.3 | 93.8 |

That is a genuine trade — buy throughput and queue relief with revenue — and it is the only lever that raised the ceiling, exactly as D14 argued.

**Recommendation (OPEN-6):** re-scope the offered options to **0.80 / 0.70 / 0.60** (keeping 0.80 as the visible "cap the greedy" setting only if driver targets are given spread), or give driver target SOC per-vehicle variance so 0.90 and 0.80 bite on someone. Shipping a control where three of four settings do nothing is a legibility bug in a build whose gate criterion is legibility — and Phase 2's `ChargingPolicyPanel` would ship it.

### 5.5 Power policies behave as specified, but only when the cap binds

At the scenario's own 350 kW the three automatic policies land within ~1% of each other, because the cap only binds in three windows. Squeeze the grid and the design intent appears cleanly (20-seed means at 120 kW): `queue_relief` 88 sessions / 12 abandonments, `equal_share` 78 / 14, `fast_first` 76 / **43**.

So `queue_relief` is the throughput-and-fairness policy, `fast_first` is the trap, and the Calibration §8 gradient (`equal_share` → `queue_relief` lifts sessions/hr at peaks) holds. Nothing to fix — but worth knowing that **on the shipped scenario the power policy is a weak lever**, which is a point in favour of the §5a worry that the £40k upgrade may also be weak. That is Phase 3's job.

---

## 6. What Phase 2 can start on regardless

None of the four open items blocks the dashboard. The sim core is stable, deterministic, instrumented and fully typed; the 15-component cut reads from `SiteMetrics`, `DemandFunnel`, `failureStatesActive`, `activeAlerts` and the event ring, all of which exist and are populated. The items in §5 change *numbers* the dashboard displays, not the shape of what it displays.

The one exception is §5.4: `ChargingPolicyPanel`'s option list should not be built until OPEN-6 is decided.

---

## 7. Recommended order of decisions

1. **OPEN-4 (trust)** — biggest blast radius; changes admission, two goals and one failure state.
2. **OPEN-5 (wait noise)** — unlocks `queue_collapse` and makes abandonment a live mechanic.
3. **Re-set the goals** (§3) from a fresh batch taken *after* 1 and 2 land. Re-setting them against today's numbers would just have to be redone.
4. **OPEN-6 (partial-charge options)** — small, and Phase 2 wants the answer.
5. **OPEN-2 (maintenance)** — unchanged in urgency; Phase 3, as agreed, but the measurement is now in hand and the recommendation is option (b).

Re-run `npm run baseline` after each; it takes 23 seconds.
