# ChargePointOperator — Development Log, 2026-11-15

**Purpose:** a running record of work done *outside* the phased plan. The Plan says what we intend to build; the Decision Log says what we ruled; this says what actually happened, including the dead ends and the things found by accident.

**Convention:** one file per working day, `ChargePointOperator_Dev_Log_YYYY-MM-DD.md`. The log is the series.

**Status of this entry:** three model decisions (D65–D67) from the strategy analysis, chosen by Mark from a list of options. The game should now be winnable on purpose, replays are fair, and trust can be recovered but not neglected.

---

## 1. What shipped

| Area | Change | Where recorded |
| :-- | :-- | :-- |
| Model | A seed is a fixed day: keyed random draws, and faults from a per-bay wear budget | D65 |
| Model | Trust: drive-on penalty halved; recovery while no broken bay is open; −2 an hour for each broken bay left open | D66 |
| Goals | Re-fitted at all three sites against a good-player benchmark as well as the baseline | D67 |
| Tooling | `npm run sim -- winnable`, and a winnability section in `gate`; `bench --fresh-prefix` | D67 |
| Docs | Decision log D65–D67; Calibration v4.2 (§7 re-measured); strategy analysis v1.3 (§5c); How It Plays (dated 2026-11-15) | — |
| Docs sync | Architecture, `docs/ARCHITECTURE.md`, KPI dictionary v1.7, scenario spec, model map, README, Plan, Session Pack; gate scorecard v2.3 from a 40-seed `gate` run (criteria 2–4 and winnability all pass; criterion 2 no longer narrow, `trust_crash` 4 → 11 runs) | `9c1561c` |
| Interface | Each panel's fixed explanation moved from below the panel into a **?** after its title (hover, keyboard focus or tap). Price, Charging limit, Maintenance, Bays, Takings and margin, Waiting and walking away; Power sharing's per-option descriptions became one list there. Copy that changes in play (Diagnosis "Seen today", the manual kW note, the end-of-day panel) stays inline | Mark's request; `Panel.tsx` `help` prop |
| Interface | The ? pop-over is placed against the panel header and capped at the panel's width; anchored at the ?, it ran off the screen on narrow panels (Mark's screenshot) | `25d4070` |

## 2. How the session went

It started from yesterday's strategy analysis (`ChargePointOperator_Strategy_Analysis_2026-11-14.md`). Mark asked a further question about trust: it seemed very easy to lose and hard to recover, and the "turned away" cohort seemed to drive it. Measured: drive-ons were the largest drain by far, and trust never recovered within a day. Mark then asked for a summary with options and chose:

1. **Trust:** halve the drive-on penalty and let trust recover.
2. **Goals:** re-fit until stable.
3. **Luck:** a seed is a fixed day.
4. **Starting price:** leave it as a discovery.

Done in that order of dependency: D65 first (it moves every measurement), then D66, then the fit.

## 3. Things found on the way

- **Keyed draws alone weren't enough for faults.** With a coin toss per bay per minute, faults still changed when play changed which minutes a bay charged (2 of 6 test days changed their fault count). The wear budget fixed that: all six days now keep their fault count under every price.
- **A test had been passing on luck.** `power.test.ts` claimed *Finish soonest first* loses fewer drivers than *Share equally* when power is scarce. On fixed days they tie. It had been passing on 3 lucky days since D63 changed the default start. It now claims only "no worse", with the measurements in the comment.
- **Unconditional recovery was too generous.** The first version let trust heal always: a site nobody repaired ended on trust ~57 and `trust_crash` became unreachable. Recovery now waits until no broken bay is open.
- **Mark's correction, mid-turn:** a site left broken should crash trust, and the fix should be to repair or close. Added the −2 an hour per broken open bay. With nobody repairing, trust now crashes on 20/20 days at Junction 42 and Trevithick, 13/20 at Eastgate.
- **The first goal fit overshot and broke criterion 2.** A 75 s Eastgate wait goal made wave pricing a contender everywhere, as a 90 s goal had in D57. The final fit holds the wait goals and moves margin and trust.
- **Goals and best play move each other.** Each fit let the search find better play for the new goals; Junction 42's margin goal rose £50–100 a round and was still creeping at round 4. The final value was chosen from 80 unseen days rather than from the last round.
- **Junction 42's trust goal no longer bites** for the baseline (met 40/40) since D66. Left as an open question.

## 4. Numbers

| Site | Goals now | Good player | Baseline | D13 floor |
| :-- | :-- | --: | --: | --: |
| Junction 42 | £4,550 / 210 s / 55 | 63% | 1% | 100% |
| Eastgate | £1,200 / 120 s / 73 | 66% | 9% | 83% |
| Trevithick | £475 / 200 s / 63 | 85% | 5% | 93% |

Good-player rates are over 80 unseen days (Trevithick 40). Each 40-day figure carries about ±8 points of sampling uncertainty.

## 5. Working notes

- **The search runs take time.** One `bench` is 10–20 minutes a site; the iterative fit took about 75 minutes with the three sites in parallel. The scratch fit script is not in the repo; `bench` and `winnable` are.
- **`tsx` in the sandbox:** `npx tsx` can't open its IPC pipe inside the Claude sandbox. `node --import tsx <file>` works.
- **Model map line references** (`src:` fields) were not re-checked; the blocks changed by D65–D66 were rewritten, but other blocks' line numbers may have drifted.
- **zsh doesn't word-split** `$var` in a `for` loop, which broke one batch launch. Pass the arguments explicitly.

## 6. Open, carried forward

1. ~~Junction 42's trust goal~~ — **stays at 55** (Mark, 2026-11-15). It catches neglect; the site stays hard through margin.
2. **Playtest** the new goals and trust rules (Mark is playing the deployed version and will report back): do near misses feel like near misses, does trust read as recoverable, and do players find the price lever?
3. From 2026-11-14 §6: trust card colours, queue card thresholds, closing bays to shield uptime.
4. **Layout, parked.** Nine KPIs on one row and the four controls (Price, Power sharing, Charging limit, Maintenance) on the row below, on desktop. Built, then taken off `main` on Mark's call (more work to review than expected). It is on the local branch `feature/kpi-row-layout`, not pushed.
