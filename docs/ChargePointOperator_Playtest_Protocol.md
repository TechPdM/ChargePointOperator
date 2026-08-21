# ChargePointOperator — Playtest Protocol & Gate Scorecard

**Version:** 1.3 · **Date:** 2026-08-16 *(v1.1: tester count pinned · v1.2: intro script updated for the D14 charging-limit control · v1.3: readiness-review fixes — criterion 3 evidence now countable per D24, observation sheet covers latched bay transitions)*
**Companions:** Plan §6.2 (gate criteria), Scenario spec §7 (playtest seeds), KPI dictionary (§"Failure states" — D24)
**Purpose:** the Phase 4 script. Written now, before the build, so the gate can't be unconsciously rigged later — the questions below are frozen; if the prototype can't survive them, that's the finding.

---

## 1. Setup

- **Testers:** **3 external people** plus Mark — the §5 thresholds assume 3. If only 2 can be found, thresholds become "both must pass". At least one tester who is *not* a gamer and *not* an EV person — legibility must not depend on either literacy. (Mark's own runs count for criterion 3 evidence but are excluded from criterion 1 scoring — he built it.)
- **Session length:** ~30 minutes per tester. Runs use the roadside-hub scenario on fixed seeds `pt-1` → `pt-2` → `pt-3` (same order for everyone).
- **Recording:** run manifests + full NDJSON logs saved per run, labelled `tester-run` (alongside the automatic `baseline` runs on the same seeds). Notes taken live on the observation sheet (§4).

## 2. Session structure

**Intro script (read verbatim, nothing more):**

> "You're running an EV charging site for one compressed day — five real minutes. You want to end the day profitable, with short queues and a good reputation. The controls on the left change price, power, charging limits, maintenance, and which bays are open. Everything else on screen is information. There's no way to lose in the first minute, so poke things."

That's the entire briefing. **No KPI explanations, no strategy hints.** If a tooltip doesn't explain it, it isn't explained — tooltips are part of the product under test.

- **Run 1 — free play** (seed `pt-1`). Think-aloud requested. Observer stays silent.
- **Post-run 1 — the three frozen questions** (§3), then: "What would you try differently?"
- **Run 2 — improve** (seed `pt-2`): "Try to beat your last result."
- **Post-run 2** — three questions again, plus: "What do you think the *best* strategy is? Is there a second, different strategy that could also work?"
- **Run 3 — offered, not assigned:** "We're done — unless you want another go." **Whether they take it is data** (criterion 5). If they play, ask them to try a genuinely different approach.

## 3. The three frozen questions (criterion 1)

Asked immediately after each run, dashboard still on screen, ~30 seconds each:

1. **"What went wrong (or right) in that run?"** — pass: identifies a real cause (fault, peak wave, power cap, pricing) that the logs corroborate.
2. **"What did you change, and why?"** — pass: recalls their own interventions and intent.
3. **"Did it work? How do you know?"** — pass: points at a specific KPI/panel movement, correctly.

Score each ✓/✗ against the logs afterwards — a confident wrong answer is a ✗ *and* a legibility bug.

## 4. Observation sheet (per run)

Log with timestamps: every question the tester asks aloud (each is a legibility bug — count them) · panels looked at vs ignored · first intervention time · reaction to the 12:30 scripted fault (noticed within 15 real seconds? acted?) · any "wait, why did—" moments · abandoned/confused controls · whether the survivorship pairing (wait ↓ / abandonment ↑) misleads them.

**Two specific things to watch for, both known legibility hazards by construction:**

- **Latched bay transitions (D19).** Closing or upgrading a busy bay doesn't take effect until the bay frees. A tester who clicks close and sees nothing happen has found either a UI failure or a real one — note which. `BayAvailabilityPanel` is required to show a pending state; if they don't notice it, that's the bug.
- **Two different "lost drivers" percentages.** Abandonment rate and `1 − charge-start success` have deliberately different denominators (KPI dictionary). A tester spotting the mismatch is asking a fair question; log it as a tooltip failure, not tester confusion.

**Observer rules:** never point at the screen · never name a lever · answer any question with "what do you think?" once, then note it and stay silent · no reassurance mid-run.

## 5. Gate scorecard

Filled in once, after all testers. Verdicts per Plan §6.2: **pass / tune / pivot.**

| # | Criterion | Evidence source | Pass threshold |
| :-- | :-- | :-- | :-- |
| 1 | Legibility | §3 question scores | ≥ 2 of 3 external testers score ≥ 5/6 ✓ across runs 1–2, within ~30s each |
| 2 | No dominant strategy | Phase 3 sweep results + §2 strategy probe + run logs | Sweeps show ≥ 2 distinct policy families winning on different archetypes; testers propose ≥ 2 different credible strategies |
| 3 | Failure modes reachable | `RunManifest.failure_states_observed` across all runs (incl. Mark's) — **detection rules per D24; this is a count, not a judgement call** | ≥ 4 of 5 failure states observed arising naturally across all runs |
| 4 | Decisions matter | `compareRuns` played-vs-baseline on same seeds | Median played run differs from baseline meaningfully on ≥ 2 goal KPIs (direction per tester intent); operator questions (pricing/maintenance/power) answerable from logs |
| 5 | One-more-run | Run 3 uptake + unprompted retry requests | ≥ 2 of 3 external testers voluntarily take run 3 |

**Verdict mapping (from the plan, restated):** all five pass → **go** (Phase 5). Fails on 1/3/4 → **tune** (fix legibility/balance in Phase 3 tooling, re-test with fresh testers). Fails on 2 or 5 specifically — it's a solved puzzle or nobody cares to replay → **pivot** to Operations Balancer, reusing the core.

Partial credit is not a verdict. If results straddle categories, the worst-failing criterion decides.

## 6. Findings note

1–2 pages, written within a week of the last session: scorecard with evidence links (run IDs) · top 5 legibility bugs (from question counts) · strategy space observed · the verdict and its consequence · what the next phase's first three tasks are. This note is the actual deliverable of the entire MVP (Plan §6.1).
