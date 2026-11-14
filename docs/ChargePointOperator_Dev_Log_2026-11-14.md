# ChargePointOperator — Development Log, 2026-11-14

**Purpose:** a running record of work done *outside* the phased plan. The Plan says what we intend to build; the Decision Log says what we ruled; this says what actually happened, including the dead ends and the things found by accident.

**Convention:** one file per working day, `ChargePointOperator_Dev_Log_YYYY-MM-DD.md`. The log is the series.

**Status of this entry:** a short day. One question about how many simulations the project has run, and one reported bug, a bay stuck in "Pending — closing when it frees", which became D64. Deployed.

---

## 1. What shipped

Live at `cpo.thisliquidspace.com`, on `main` at `65f49cc`. Version still 0.2.0.

| Area | Change | Where recorded |
| :-- | :-- | :-- |
| Model | With no contract, closing a faulted bay applies at once; the bay stays faulted; closed time is not counted against uptime | Decision log D64 |
| Interface | A pending close can be cancelled: the bay button reads **Keep open** | D64; §3 below |
| Interface | The Average wait card's colours ran backwards (red at zero, green as the wait grew) | §2a below |
| Docs | KPI dictionary v1.6; Architecture §4 (charger bay) and the `toggle_bay_group` type; Session Pack observer note | §4 below |

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

*Code:* `toggle_bay_group` in `src/game/actions/playerActions.ts` (faulted + reactive applies at once); `accumulateBayTime` in `src/game/systems/scoring.ts` checks `isOpen` before the fault and repair buckets; `BayAvailabilityPanel.tsx` button and panel note.

*Checked:* typecheck clean; 177/177 tests, four new in `mechanics.test.ts` (closes at once on reactive and stays faulted; still latches on standard; uptime counts while open and not while closed, and again on reopening; repairable while closed and returns closed). The baseline never closes a bay, so the goals and gate measurements do not move. Not yet looked at in a browser.

## 2a. Average wait coloured backwards

*Reported:* the Average wait card was red at zero, then amber, then green as the wait rose.

*Cause:* the card called `toneFor(wait, 300, goal)`: green up to 300 s, red at the scenario goal. `toneFor` reads the direction from which threshold is larger. When the roadside goal was 420 s that was right; D57 re-fitted the goals to 210 / 120 / 200 s, all under 300, so "good" sat above "bad" and higher waits read as better. A regression from the goal re-fit, missed because the UI had no check on tone direction.

*Fix:* green up to 70% of the goal, red past the goal, keeping the old 300-of-420 ratio and unable to invert whatever the goal. `KpiCardGrid.tsx`. Typecheck clean.

*Noticed, not changed:* the queue card is green up to pressure 0.5, but D58 put `queue_collapse` at 0.5, so the card can read green at the threshold where collapse sets in.

## 3. How many simulations have we run?

Not known: nothing counts runs. The only saved output is in `runs/` from 16–18 August (four 20-seed baselines, the roadside sweep, two strategy score files). A strategy test plays 8 strategies at 3 sites, 24 runs a seed: 960 days at 40 seeds, 1,920 at 80. With the gate probes, the test suite on every run and browser play, the estimate given was the low tens of thousands of simulated days, stated as an estimate. A run counter in `runScenario` writing to a git-ignored tally was offered; not taken up.

## 4. Docs

- Decision log: **D64**, including the declined all-levels option.
- KPI dictionary **v1.6**: uptime denominator note for closed faulted bays.
- Architecture: the charger-bay state machine paragraph and the `toggle_bay_group` comment.
- Session Pack: the latched-transition observer note now gives the D64 exception and the *Keep open* button.

## 5. Working notes

- **Netlify builds on deploy.** `netlify deploy --prod --dir=dist` ran `npm run build` itself (a build command set in the Netlify app) before uploading, so a deploy rebuilds from the working tree rather than shipping whatever is in `dist/`.
- Push and deploy were run by Mark with `!`, as before.

## 6. Open, carried forward

1. **Look at D64 in the browser:** close a faulted bay on *Repair upon request*, then check the *Keep open* button on a busy bay.
2. Everything from 2026-11-13 §7 stands: the playtest, the narrow criterion 2 pass, maintenance near-dominance, the harsher no-contract start, the unreproduced freeze.
3. **Queue card thresholds** (green ≤ 0.5, red ≥ 1.5) predate D58's 0.5 collapse threshold; Mark's call whether to align them.
4. **Watch in the playtest** whether players use closing to shield uptime from faults, now that it works.
