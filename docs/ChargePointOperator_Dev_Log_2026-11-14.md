# ChargePointOperator — Development Log, 2026-11-14

**Purpose:** a running record of work done *outside* the phased plan. The Plan says what we intend to build; the Decision Log says what we ruled; this says what actually happened, including the dead ends and the things found by accident.

**Convention:** one file per working day, `ChargePointOperator_Dev_Log_YYYY-MM-DD.md`. The log is the series.

**Status of this entry:** one model change (D64, from a bay stuck in "Pending — closing when it frees"), a goals-met celebration on the end-of-day panel, and several interface fixes. Six deploys, all live.

---

## 1. What shipped

Live at `cpo.thisliquidspace.com`, on `main` at `07a775a`. Version still 0.2.0.

| Area | Change | Where recorded |
| :-- | :-- | :-- |
| Model | With no contract, closing a faulted bay applies at once; the bay stays faulted; closed time is not counted against uptime | Decision log D64 |
| Interface | A pending close can be cancelled: the bay button reads **Keep open** | D64; §3 below |
| Interface | The Average wait card's colours ran backwards (red at zero, green as the wait grew) | §2a below |
| Interface | The end-of-day panel moved to the top, under the run controls and above the KPIs (was below the policy panels) | Mark's request |
| Interface | Goals-met celebration on the end-of-day panel: current runs round the border and discharges (option C2); `?debug=win` to test it | §2b below |
| Interface | Speed buttons (1× 2× 4×) spaced 3 px apart instead of a joined strip | §2c below |
| Docs | KPI dictionary v1.6; Architecture §4 (charger bay) and the `toggle_bay_group` type; Session Pack observer note | §4 below |
| Docs | Detour price-ceiling plan moved into `docs/` and renamed; How It Plays, Architecture, model map, Frontend Stack, ARCHITECTURE.md, README and Session Pack brought up to date (on `main` at `e0021f3`; docs only, so no redeploy) | §4 below |

## 2. The stuck close

*Reported:* clicking Close on a bay showed "Pending — closing when it frees" and the closure never happened.

*Cause:* D19 latches a close on any bay that is not idle, so nobody is unplugged mid-charge. A faulted bay is not idle, so its close waited for the bay to go idle, which only a repair does. Since D63 the player starts on *Repair upon request*, where nobody comes unless called, so the latch never released. The bay kept counting as open and paid its share of running costs (D54). Before D63 the standard contract repaired it within 30 minutes and hid this.

Mark's point, which the sim already honoured: a faulted bay is never in use. The fault ends the session and the driver leaves (`service_interrupted`) before the bay is marked faulted, so there was never a driver to wait for.

*A second fault found on the way:* the bay button read its label from `isOpen`, which stays true while a close is pending, so it kept offering Close. D19 lets opening cancel a pending close, but the panel never offered it.

*Decided (D64), each part Mark's call:*

- On *Repair upon request* only, closing a **faulted** bay applies on the next tick. A bay under repair still latches; so does every bay on a contract. Immediate close on every level was offered and declined: closing a bay the contractor is about to fix is left as a choice for the player to manage.
- Nothing closes a bay automatically. That would take away the cost of the fault, which is the point of the mechanic.
- The bay stays faulted while closed, can be repaired while closed, and comes back closed. Reopening it unrepaired brings the fault back.
- Uptime: a faulted bay counts against uptime while open; once closed, its time counts as closed (`downtimeClosedSeconds`), outside the uptime denominator. So closing a broken bay now shields uptime and `reliability_spiral`, at the cost of its capacity. Recorded as a deliberate exception to the KPI dictionary's "closing must not be a trick to inflate uptime".

*Follow-up, same day:* Mark asked that a closed bay's fault leave the Faults panel and have no effect until reopened, with the fault still there on reopening. Uptime and running costs were already handled. Added: the Faults panel lists open bays only; the Bays panel row reads "Still faulted — it will need a repair when reopened"; the contractor skips closed bays (found while checking: switching to a contract with a closed faulted bay would have repaired and charged for a bay the player could no longer see). One more test, 178/178.

*Code:* `toggle_bay_group` in `src/game/actions/playerActions.ts` (faulted + reactive applies at once); `accumulateBayTime` in `src/game/systems/scoring.ts` checks `isOpen` before the fault and repair buckets; `BayAvailabilityPanel.tsx` button and panel note.

*Checked:* typecheck clean; 177/177 tests, four new in `mechanics.test.ts` (closes at once on reactive and stays faulted; still latches on standard; uptime counts while open and not while closed, and again on reopening; repairable while closed and returns closed). The baseline never closes a bay, so the goals and gate measurements do not move. Not yet looked at in a browser.

## 2a. Average wait coloured backwards

*Reported:* the Average wait card was red at zero, then amber, then green as the wait rose.

*Cause:* the card called `toneFor(wait, 300, goal)`: green up to 300 s, red at the scenario goal. `toneFor` reads the direction from which threshold is larger. When the roadside goal was 420 s that was right; D57 re-fitted the goals to 210 / 120 / 200 s, all under 300, so "good" sat above "bad" and higher waits read as better. A regression from the goal re-fit, missed because the UI had no check on tone direction.

*Fix:* green up to 70% of the goal, red past the goal, keeping the old 300-of-420 ratio and unable to invert whatever the goal. `KpiCardGrid.tsx`. Typecheck clean.

*Noticed, not changed:* the queue card is green up to pressure 0.5, but D58 put `queue_collapse` at 0.5, so the card can read green at the threshold where collapse sets in.

## 2b. Goals-met celebration

Mark asked for a confetti or lightning moment when every goal is met. Options were shown as a separate page first (four effects, then three finishes for the one he picked) and **C2, full-frame discharge** chosen: an arc of current runs twice round the panel border, speeding up, then the whole border flickers bright twice and throws sparks outward from every edge, leaving a green glow. About 2.8 s, once, when the panel appears; nothing on a day that misses a goal.

*Code:* `src/ui/effects/frameDischarge.ts` (plain canvas, no library; the trail is capped at 420 px and the spark count scales with the border length, since the real panel is far wider than the mock); `GoalsMetEffect.tsx` lays the canvas 80 px past the panel on every side and adds `is-lit` for the glow; with reduced motion asked for it shows the glow only. `.shell` got `overflow-x: clip` so the sparks can't widen the page.

*Testing it:* add `?debug=win` to the URL (e.g. `cpo.thisliquidspace.com/?debug=win`) and the effect plays at the end of every day whatever the outcome, with a small *Replay effect* button at the right of the panel header. It changes nothing else, including the score.

*Bug, found by Mark with `?debug=win`:* the flash traced a box unrelated to the panel. The canvas was placed with `inset: -80px` and no size; a canvas is a replaced element, so absolutely positioned it keeps its intrinsic pixel size (300×150, then whatever the code set) instead of stretching. The effect measured that box and drew round it, and resizing the canvas resized the box (StrictMode's second run in dev measured the first run's resize; in production the first measurement gives a negative height and probably nothing drew). The review page hid this by giving its canvas `width/height: 100%`. Fixed: explicit `calc(100% + 160px)` size, and the effect now measures the panel element's own border box rather than inferring it from the canvas, which also removes a 1–3 px inset from the border.

*Also fixed:* the panel's hint read "all four goals met" (and counted misses from 4) with three goals; it now reads from `GOAL_COUNT`.

*Checked:* typecheck and build; Mark checked the fixed flash with `?debug=win` ("flash looks good") and took it to mobile.

## 2c. Smaller interface changes

- **Speed buttons** were a joined segmented strip and felt cramped. Now 3 px apart (the stylesheet has no spacing step under `--gap`'s 10 px; 3 px is already used and matches `--radius`), each with its own border and corners.
- **Trust card colours** were questioned (green at Junction 42, amber elsewhere on a fresh day). Cause: every site starts on trust 60, and the card colours against the end-of-day goal (55 / 70 / 63) from the first minute, unlike the margin card, which is judged against the demand so far. A pace line was planned; not built. Mark is reconsidering whether trust is meant to be maintained or built (§6).

## 2d. The stutter, again

Reported again on the dev server, after a run of hot-reloaded edits to the header, CSS and effect files under an open tab, the same circumstances as 2026-11-13's report. Not investigated further: the next steps given were a hard reload, then the live site (no hot reload, no StrictMode), then the `[CPO]` console log if it persists. No report since.

## 3. How many simulations have we run?

Not known: nothing counts runs. The only saved output is in `runs/` from 16–18 August (four 20-seed baselines, the roadside sweep, two strategy score files). A strategy test plays 8 strategies at 3 sites, 24 runs a seed: 960 days at 40 seeds, 1,920 at 80. With the gate probes, the test suite on every run and browser play, the estimate given was the low tens of thousands of simulated days, stated as an estimate. A run counter in `runScenario` writing to a git-ignored tally was offered; not taken up.

## 4. Docs

- Decision log: **D64**, including the declined all-levels option.
- KPI dictionary **v1.6**: uptime denominator note for closed faulted bays.
- Architecture: the charger-bay state machine paragraph and the `toggle_bay_group` comment.
- Session Pack: the latched-transition observer note now gives the D64 exception and the *Keep open* button.
- **Plan moved out of `docs/superpowers`.** The detour price-ceiling plan (2026-08-19) was the only file in `docs/superpowers/plans/`. It moved into `docs/` (`942d2bf`), was renamed to the docs naming convention as `ChargePointOperator_Plan_Detour_Price_Ceiling_2026-08-19.md` (`a3ce66f`), and the empty `docs/superpowers` folder was removed.
- **End-of-day docs sync** (`e0021f3`), covering D64, the celebration and the interface changes:
  - How It Plays: dated 2026-11-14; D64 added to faults and to the open/close row.
  - Architecture §4.4: the D64 contractor rule (closed bays skipped; an old fault is dispatched at once on reopening) and the downtime accounting.
  - Model map: the bay-toggle and faults nodes carry D64.
  - Frontend Stack: 20 components; a section on the celebration.
  - `docs/ARCHITECTURE.md`: sizes re-measured (about 15.1k lines; UI 30 files, about 3,450 lines; CSS about 1,720; 178 tests); the celebration and the panel's new position.
  - README: `effects/` in the tree; 178 tests.
  - Session Pack: the observer checklist says to play without `?debug=win`.
  - Deliberately left as they were: Architecture §8.1 (the design-time layout), Playtest Protocol v1.3, Calibration, the Gate Scorecard and the historical docs.

## 5. Working notes

- **Netlify builds on deploy.** `netlify deploy --prod --dir=dist` ran `npm run build` itself (a build command set in the Netlify app) before uploading, so a deploy rebuilds from the working tree rather than shipping whatever is in `dist/`.
- Push and deploy were run by Mark with `!`, as before.
- **Review pages for visual work.** The celebration options were built as a private artifact page first and chosen there; only the chosen one went into the code. The mock panel used a canvas sized by CSS, which is why the sizing bug only showed in the game.
- **No browser checks for small visual changes.** I started playing a full day in Chrome to watch the effect; Mark stopped it as overkill. Small UI changes: typecheck, build, commit, hand over the deploy. Saved to memory.

## 5a. Strategy analysis: why days end just short

Mark suspected the game had become almost impossible to win. Measured and written up in `ChargePointOperator_Strategy_Analysis_2026-11-14.md`. In short: each goal sits near the baseline's median, so a win needs three coin-flips on one day (baseline wins 8–12%, the best built-in strategy 60% / 20% / 45% at Junction 42 / Eastgate / Kesteven). D13 only checks that the game isn't too easy, never that it can be won. Faults (1–7 a day) dominate margin and trust, and any action that changes the random draws reshuffles the rest of the day. No recent regression. The doc proposes six changes, recommends a good-player benchmark, a winnability check and a goal re-fit first, and leaves the order to Mark. No code changed.

## 5b. Site picker easiest first

Mark asked for the site picker reversed so new players start on the easy site. It now lists Kesteven, Eastgate, Junction 42, and the game opens on Kesteven. Interface only (`PICKER_ORDER` in `scenarios/index.ts`); the CLI and gate tests keep the old order. Note from §5a: by measured win rate under good play, Junction 42 is the most winnable (60%), Kesteven next (45%) and Eastgate least (20%); Kesteven is the gentlest to play, not the easiest to win. Typecheck clean.

## 5c. Kesteven renamed Trevithick

Mark's call: the destination site is now **Trevithick Garden Centre**. Changed in the scenario, code comments, README and the current docs (How It Plays, Calibration, Gate Scorecard, the roadside scenario spec, the model map and today's strategy analysis). The decision log, the dev logs, the phase findings, and the pricing and plan docs keep "Kesteven" as the name at the time. The scenario id (`destination-site-01`) is unchanged, so seeds and saved runs are unaffected.

## 5d. The good-player benchmark

Built item 3 of the strategy analysis: a scripted good player (`experiment/goodPlayer.ts`), a per-site search over its settings (`experiment/benchmark.ts`) and a `bench` command. It tunes on 16 days and reports on 40 fresh ones. Fresh-day win rates: **Junction 42 88%, Trevithick 83%, Eastgate 25%** (baseline 10%, 13%, 3%). Price is the main lever, and the best price is above the starting price at every site. Eastgate's margin goal is out of reach even for the good player (met 28%). Results in strategy analysis §5b (raw JSON in `runs/`, git-ignored). Five new tests. About 16 minutes for the three sites in parallel.

## 6. Open, carried forward

1. **Look at D64 in the browser:** close a faulted bay on *Repair upon request*, then check the *Keep open* button on a busy bay.
2. Everything from 2026-11-13 §7 stands: the playtest, the narrow criterion 2 pass, maintenance near-dominance, the harsher no-contract start, the unreproduced freeze (reported again today, §2d).
3. **Trust card colours.** Every site starts on trust 60, so the card opens green at Junction 42 (goal 55) and amber at Eastgate (70) and Kesteven (63). A pace line like the margin card's was planned; Mark is reconsidering whether trust is meant to be maintained or built, which decides it.
4. **Queue card thresholds** (green ≤ 0.5, red ≥ 1.5) predate D58's 0.5 collapse threshold; Mark's call whether to align them.
5. **Watch in the playtest** whether players use closing to shield uptime from faults, now that it works.
