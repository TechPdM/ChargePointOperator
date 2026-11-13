# ChargePointOperator — Development Log, 2026-11-13

**Purpose:** a running record of work done *outside* the phased plan. The Plan says what we intend to build; the Decision Log says what we ruled; this says what actually happened, including the dead ends and the things found by accident.

**Convention:** one file per working day, `ChargePointOperator_Dev_Log_YYYY-MM-DD.md`. The log is the series.

**Status of this entry:** the day started as a review of where the project stood and became a model revision (D46–D63), a re-scored gate, three deploys of model work and three of interface work. The model decisions are in the decision log and are only summarised here; the interface and tooling changes, which took no decision worth an entry, are recorded in full.

---

## 1. What shipped

Version **0.2.0**, live at `cpo.thisliquidspace.com`, on `main` at `294e5f1`.

| Area | Change | Where recorded |
| :-- | :-- | :-- |
| Review | `How_It_Plays.md`, a plain-language account of the game as built, and a list of where the canonical docs had drifted from the code | `docs/ChargePointOperator_How_It_Plays.md` |
| Model | D46–D60: one car range for every driver, per-driver charge targets with the taper now biting, shorter queue tolerance and patience, charging limit off / 90 / 75 / 50%, drivers choose the best bay, faults halved, connection fee £0 and hidden, contractor repairs, closed bays cost nothing, £100 call-out premium, drive-ons counted and shown | Decision log D46–D60 |
| Gate | Goals re-fitted (D57, D59); `queue_collapse` re-derived (D58); criterion 2 recorded FAIL on the strict reading (D61), then passed narrowly under an amended rule (D62), decided after the fail and recorded as such | Decision log D57–D62; scorecard v2.2 |
| Maintenance | Options relabelled *Repair upon request* / *Standard contract* / *Preventive contract*; the player starts with no contract while the baseline still takes standard at 00:00 | Decision log D63 |
| Docs | Every canonical doc brought back to the code; `model-map.html` regenerated; historical docs given a dated banner | §5 below |
| Interface | App title and version top right; version and source link in the footer; random day on load, New seed and Free play | §2, §4 |
| Tooling | Dev-only `[CPO]` console logger for UI stalls | §3 |

---

## 2. Title, version and footer

- **Header:** "Charge Point Operator v0.2.0" pinned to the top-right corner, on the same row as the site header at every width. The first attempt stacked the title over the run controls in one column, which dropped the title to a second row whenever the window was too narrow for one line. The top bar is now a CSS grid: `header controls title` on one row from 1700px up; below that `header title` with the controls on a row of their own; title first at phone width.
- **Footer:** `v0.2.0 · thisliquidspace.com · Source on GitHub` (the repo is public, checked).
- **Version source:** `package.json`'s `version` and the short git commit, injected at build time by `vite.config.ts` (`define: __APP_VERSION__, __APP_COMMIT__`), typed in `src/build-info.d.ts`, read through `src/ui/buildInfo.ts`. The commit shows on hover over the title and the footer version. It is empty if the build runs outside a git checkout. The version was bumped **0.1.0 → 0.2.0** for the model revision.

## 3. The reported freeze, and the dev logger

*Reported:* "the UI keeps freezing — pauses as soon as I change the price, was fine before; something we've changed in this session has caused it". The same shape of report opened the 2026-08-18 log.

*What was measured, none of which reproduced it:*

| Check | Result |
| :-- | :-- |
| Sim tick cost, headless, today vs `6770ec4` | ~0.7 ms mean, unchanged |
| Full day at 4× in Chrome, hands off | ~56 fps; worst main-thread block 167 ms; end-of-day scoring smooth |
| Day at 4× with the slider dragged 40 steps, policy, limit, maintenance and a bay changed | every action rendered in ~33 ms; nothing over 50 ms |
| Real mouse drag of the price slider at 1× | price applied, clock kept running |
| Price change at £0.60–£1.20 at four times of day, invariants set to throw | no exception |
| Main thread stalled 3 s | recovered without a catch-up burst (D40 holds) |

*Code review:* every change this session on the browser's path was read for loops that might not end, exceptions on player-driven paths and anything that pauses the run. None found. One existing weakness was found, not new: if anything throws while the game loop is spending its ticks, the next frame is never requested, so the day stops for good while the page still looks alive.

*Outcome:* the issue stopped occurring and was left there. The likeliest explanation is a dev server that had hot-reloaded several edits to the header, CSS and `vite.config.ts` into a running page; that is not proven.

*The dev logger*, kept so the next report comes with evidence. `src/ui/devLog.ts`, installed from `src/main.tsx`. Open DevTools and filter the console on **`[CPO]`**. Each line carries the sim clock, tab visibility and window focus. It logs:

- every player action, and every pause, resume and end of day
- main-thread blocks over 100 ms
- game-loop frames more than 500 ms apart, and frames that spent more than 50 ms on ticks
- the loop running while React has not re-rendered for over a second
- an exception escaping the game loop (logged, then rethrown, so behaviour is unchanged), and any uncaught error or rejection

Every call is gated on `import.meta.env.DEV`, so the production bundle contains none of it (checked: no `[CPO]` in `dist/`).

## 4. Random days

The dashboard always opened on seed `s1`, so everyone played the same day until pressing New seed, and New seed only stepped to the next one (`s1` → `s2`). Now first load, **New seed** and choosing **Free play** all pick a random day from `s1`–`s9999` (`src/ui/seeds.ts`), never repeating the current one. The seed stays visible in the top bar, so a day can be noted and replayed. The **Playtest pt-1 / pt-2 / pt-3** seeds are fixed, as the protocol requires; the session pack already tells the observer to select `pt-1` before a session.

## 5. Docs brought back to the code

`How_It_Plays.md` §10 listed the drift; D56 recorded the fix. Updated today: the roadside scenario spec (hardware, grid, cash, upgrade and demand had been pre-re-rating since 2026-08-17), Architecture §6 formulas and §5 types, the KPI dictionary (turned-away KPI, `queue_collapse` threshold), the calibration sheet (v4.1, §7 re-measured), the gate scorecard (v2.2), the plan, the session pack (observer notes for contracts, the call-out premium, drive-ons and the no-contract start), `ARCHITECTURE.md`, the front-end stack doc and the README. `model-map.html` was regenerated from the code by a subagent and checked (syntax, edge references, spot values). Phase 1/3 findings, the pricing-model docs and earlier dev logs were left as written, with a banner saying they describe an earlier model.

## 6. Working notes

- **Deploy and push from this sandbox.** `netlify deploy` cannot read the Netlify token and `git push` cannot reach the SSH keys, so both were run by Mark with `!`. Saved to memory so later sessions hand them over straight away.
- **`npx` calls the npm registry**, which the sandbox blocks; local binaries in `node_modules/.bin` avoid the noise.
- **"Please run /login · API Error: 403 Attention Required! | Cloudflare"** appeared during the session. It came from Claude Code's own traffic to claude.ai (a probe from this machine got a Cloudflare 403 from `claude.ai` while `api.anthropic.com` answered normally), not from the project. Not resolved here.
- **Experiment runs** were plain Node processes (`node --experimental-strip-types`) on the sim code, not model calls; the 40- and 80-seed strategy tests took 15–40 minutes each.

## 7. Open, carried forward

1. **The playtest.** Criteria 1 and 5, and criterion 2's tester half, need three external testers. Whether they find the `wave-pricing` rule decides how the D62 pass reads.
2. **Criterion 2 is narrow.** `wave-pricing` is within 0.15 goals of the best everywhere; a small model change could make it dominant under D62 too.
3. **Maintenance near-dominance** (OPEN-2 / D33): `preventive` is part of every site's best strategy.
4. **A starting day with no contract is harsher**, especially at the 12:30 scripted fault. Watch it in the playtest.
5. **The freeze** was not reproduced; the logger is there for the next report.
