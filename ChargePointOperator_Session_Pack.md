# ChargePointOperator — Playtest Session Pack

**Print this, or keep it open on a second screen.** Everything an observer needs for one 30-minute session, in the order it happens. The wording comes from `ChargePointOperator_Playtest_Protocol.md`, which was frozen before the build; **do not improve it on the day.**

---

## Before they arrive

- [ ] `npm run dev`, dashboard open at the Junction 42 site, seed set to **Playtest pt-1**
- [ ] Speed on **1×** (the day takes 5 real minutes; do not speed it up for them)
- [ ] This sheet, a timer, and somewhere to write
- [ ] Tester is **not** you. At least one of your three should be neither a gamer nor an EV person

**Do not** explain the KPIs, name a lever, or offer strategy. If a tooltip does not explain it, it is not explained — the tooltips are part of what is being tested.

---

## Intro script — read verbatim, add nothing

> "You're running an EV charging site for one compressed day — five real minutes. You want to end the day profitable, with short queues and a good reputation. The controls on the left change price, power, charging limits, maintenance, and which bays are open. Everything else on screen is information. There's no way to lose in the first minute, so poke things."

Then stop talking.

---

## Run 1 — free play (`pt-1`)

Ask for think-aloud. **Stay silent.** Answer any question with "what do you think?" *once*, then note it and say nothing further.

**Observation sheet — tick and timestamp as they happen:**

| | Note |
| :-- | :-- |
| Every question asked aloud (each one is a legibility bug — count them) | |
| Time of first intervention | |
| Panels looked at | |
| Panels never looked at | |
| Reaction to the 12:30 fault — noticed within 15 real seconds? acted? | |
| "Wait, why did—" moments | |
| Controls touched then abandoned | |

**Two known hazards to watch for specifically:**

- **Latched bay transitions.** Closing or upgrading a busy bay does not take effect until the bay frees. `BayAvailabilityPanel` shows a pending state. If they click close, see nothing happen, and do not notice the pending label — that is the bug, and note which kind.
- **Two different "lost drivers" percentages.** Abandonment rate and `1 − charge-start success` have deliberately different denominators. A tester spotting the mismatch is asking a fair question; log it as a tooltip failure, not tester confusion.

- [ ] **Save run** before restarting

---

## After run 1 — the three frozen questions

Dashboard still on screen. ~30 seconds each. Score ✓/✗ afterwards **against the logs** — a confident wrong answer is a ✗ *and* a legibility bug.

1. **"What went wrong (or right) in that run?"**
   *Pass:* identifies a real cause — a fault, a peak wave, the power cap, their own pricing — that the logs corroborate. ⬜ ✓ ⬜ ✗
2. **"What did you change, and why?"**
   *Pass:* recalls their own interventions and what they were for. ⬜ ✓ ⬜ ✗
3. **"Did it work? How do you know?"**
   *Pass:* points at a specific KPI or panel movement, correctly. ⬜ ✓ ⬜ ✗

Then: **"What would you try differently?"** (not scored — it sets up run 2)

---

## Run 2 — improve (`pt-2`)

> "Try to beat your last result."

- [ ] **Save run**

### After run 2 — the same three questions, then the strategy probe

1. ⬜ ✓ ⬜ ✗   2. ⬜ ✓ ⬜ ✗   3. ⬜ ✓ ⬜ ✗

**"What do you think the *best* strategy is? Is there a second, different strategy that could also work?"**

*(This is criterion 2's tester half. The sweeps already show three different policies winning on the three sites; the question is whether a person perceives more than one.)*

Strategy 1: ______________________  Strategy 2: ______________________

---

## Run 3 — offered, never assigned

> "We're done — unless you want another go."

**Whether they take it is the measurement.** Do not encourage, do not wait expectantly, do not explain that it matters.

⬜ Took run 3 voluntarily  ⬜ Declined  ⬜ Asked to keep playing afterwards

If they play: ask them to try a genuinely different approach, and save the run.

---

## Scoring, afterwards

| Criterion | This tester |
| :-- | :-- |
| 1 — Legibility: ✓ count across runs 1–2 (of 6) | ___/6 |
| 2 — Proposed ≥2 credible strategies | ⬜ yes ⬜ no |
| 5 — Took run 3 | ⬜ yes ⬜ no |
| Questions asked aloud (legibility bugs) | ___ |

**Thresholds** (protocol §5, three testers): criterion 1 passes if **≥2 of 3 score ≥5/6**; criterion 5 passes if **≥2 of 3 take run 3**. With only two testers, both must pass.

Add the run manifests to the gate scorecard's criterion 3 count — every tester run contributes its `failure_states_observed`.

---

## Observer rules

- Never point at the screen
- Never name a lever
- Answer any question with "what do you think?" once, then note it and stay silent
- No reassurance mid-run
- Do not defend the design. If they are confused, that is the finding
