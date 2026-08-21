# ChargePointOperator — Development Log, 2026-08-18

**Purpose:** a running record of work done *outside* the phased plan. The Plan says what we intend to build; the Decision Log says what we ruled; this says what actually happened, including the dead ends and the things found by accident.

**Convention:** one file per working day, `ChargePointOperator_Dev_Log_YYYY-MM-DD.md`. The log is the series.

**Status of this entry:** the day started from "the UI keeps hanging, ever since we changed how the pricing slider works". The slider was innocent and that took five minutes to establish; the rest of the day came out of what the measurement turned up instead. Nine commits, all on `main`. §5 is the one to read if you are picking this up — it is the reason the remaining render work is postponed rather than finished, and §6 is why that postponement is a judgement about the *instrument* rather than about the work.

---

## 1. What shipped

| Commit | What |
| :-- | :-- |
| `0726126` | End-of-day baseline moved off the main thread into a worker |
| `e156786` | Concluded sessions dropped from `state.sessions` |
| `c2485a5` | Calibration §7 re-measured against the re-rated sim (v3.3) |
| `82ae8df` | Gate criterion 2 judged on separation, not argmax — **D38** |
| `491d445` | Scorecard's "three distinct winners" claim corrected |
| `506a86a` | Departed vehicles become flat records — **D39** |
| `cb5dec1` | Stalled-tab fast-forward fixed |
| `5b8377d` | Focus loss does not pause the day — **D40** |
| *(this commit)* | Charts and event log memoised — option 4 of §5 — and this log |

Three freezes were found and only the first was the one reported.

---

## 2. The reported hang, and what it actually was

`compareRuns` ran `runBaselineFor` — a full 1,440-tick simulation — **synchronously inside the `useReducer` reducer**, on the tick the day closed. Measured 1,820 ms headless and a **2,577 ms** frozen main thread in the browser, landing exactly at 24:00. The comment above it claimed "a few hundred ms once", about six times low, and the estimate had got worse with D36's demand.

It now runs in a module worker. The reducer only flags `scoring` on the running → not-running transition; an effect posts the request and dispatches the result back. Measured after: **363 ms cold, 255 ms warm.**

**The pricing slider was not involved.** `a5af60b` touched `PricingControlPanel` and one `key` prop, neither of which is in the tick or reducer path. Measured at the slider commit, the day-close baseline already cost 1,165 ms; what made it noticeable was `52067a7`'s ×1.8 demand landing an hour later and taking it to 1,820 ms.

---

## 3. Two accumulators nobody read

Both found while looking for the above, both the same shape: state retained for the whole day, deep-cloned by `tick` every tick, read by nothing.

**Sessions** (`e156786`). 311 concluded sessions retained by midnight. Every read of `state.sessions` is keyed on `activeSessionIds` or a bay's `activeSessionId`, and the KPIs are counters on `site.metrics`. Full run 1,562 → 1,340 ms; per-tick across the back three-quarters 1.362 → 1.164 ms.

**Vehicles** (`506a86a`, D39). 420 full `VehicleAgent`s retained by midnight. Per-tick 1.134 → 0.950 ms (−16%); full run 1,312 → 1,110 ms; serialised state 296 KB → 190 KB.

Both verified the same way and it is the verification that matters: **20 seeds against the previous commit, every KPI bit-identical, `finalStateHash` moving on all twenty.** That is the evidence the pruned state was genuinely unread.

**Correction worth carrying:** the vehicle saving was first estimated at 59%. That was measured without JIT warm-up and was wrong. Warmed and interleaved it is 17% of clone cost, and 16% of per-tick cost. Use the later figure.

The real risk in D39 was never performance — it was that three invariants read terminal vehicles and would have gone from *failing* to *passing on an empty collection*, which is also exactly what a broken close-out sweep produces. They are restated, and four tests drive each failure deliberately.

---

## 4. The freeze that was actually reported

Only found after asking what "glitchy" meant and being told **the whole UI freezes, even the ticks**. That ruled out render jank, which only makes the clock stutter, and pointed somewhere I had not looked.

`useGameLoop` accrues tick debt from wall-clock and spends at most twelve ticks per frame. The cap bounded a single frame's work but **the backlog survived**, so the loop kept running twelve ticks a frame until every missed tick had been replayed. Anything that stalls rAF triggers it — backgrounding the tab, switching apps, minimising, the machine sleeping.

Reproduced by injecting a 60-second gap at 4×:

| | before | after |
| :-- | --: | --: |
| ticks replayed | ~1,196 (80% of a day) | **12** |
| frames the board could not paint | 134 | **~3** |
| clock jump | `00:17` → `20:13` | `00:19` → `00:32` |

The ticks were never frozen; they were racing where nobody could see them. The harm is not the freeze, it is that a minute away eats most of the run.

`useGameLoop.ts:15` claimed this was already handled — *"Cap the catch-up after a stall, so a backgrounded tab doesn't fast-forward."* The intent was written down and never implemented, which is presumably why it survived. The arithmetic now lives in `spendDebt` with five tests, so it is pinned in CI rather than by a browser repro.

---

## 5. React render cost — **investigated, postponed, options below**

This is the one live piece of work. It is postponed by choice, not blocked.

### What was measured

Driving exactly one tick per frame — as real play does, and as the earlier 12-ticks-per-frame harness did **not**, which is why this was hidden for most of the day:

- **median 16.1 ms per tick**, p90 26.8, p99 42.5
- roughly **half of all ticks exceed a 16 ms frame budget**
- the tick itself is 0.95 ms, so **~94% is React render and commit**
- without StrictMode: median 14.4 ms, so dev overhead is only ~11% and the cost is real

At 1× that is ~7% of the main thread and fine. This is a 2× and 4× problem.

### Where it goes

React Profiler, per panel. All 15 rendered **264 times out of 264 commits** — nothing is memoised, so everything re-renders every tick regardless of whether its data moved.

| Panel | Share |
| :-- | --: |
| `EventLogPanel` | 16% |
| `BayAvailabilityPanel` | 14% |
| `WaitTimeTrendChart` | 12% |
| `EconomicsTrendChart` | 11% |
| `KpiCardGrid` | 11% |
| power · maintenance · queue · runControls · chargingPolicy | 24% |
| header · diagnosis · pricing · faults · alerts | 12% |

**The cost is spread, not concentrated** — the worst panel is 16%, the top five are 64%. Memoising one or two things buys almost nothing. That is the finding that shapes the options.

But note *which* panels pay: the charts only need redrawing when `snapshots` changes, which is **every fifth tick**; `EventLogPanel` only when events are emitted. The standing-policy panels change when the player touches a control, which is almost never. Ceiling if nothing rendered unnecessarily: **50–60%**.

### The options

1. **Narrow the props, then memo.** The blocker is that every panel takes `sim` or `state`, whose identity changes every tick, so `React.memo` alone does nothing. Each panel would take the values it actually reads. Touches all 15 components; mechanical, and verifiable panel by panel. Biggest win, and it makes the data flow honest — right now every panel *claims* to depend on the whole world.
2. **Decouple render rate from tick rate.** Tick at 19/sec, commit to React ~10/sec. One place, ~20 lines, roughly halves the cost at 4×. Needs care around **D26** (the tick is authoritative) and the clock would update in visible steps. Hides the cost rather than removing it.
3. **Store slices.** `useSyncExternalStore` with per-panel selectors. The proper fix, subsumes option 1, biggest change — and it reworks `useSimulation`'s contract, which **D28** pins as "`useReducer` over the whole `SimulationState`", so it would want a D-entry.
4. **Cheap targeted wins.** Memo the two charts on `snapshots` and the event log on `events` — those props already have stable identity. **This one is done; see §6 for what that did and did not prove.**

Suggested order was 4 → 1. Still holds, but §6 is why 1 has not started.

---

## 6. Why the render work stopped — the measurement is not trustworthy

Option 4 is implemented and **committed** — `App.tsx` plus the two charts and `EventLogPanel`. 132 tests pass, typecheck clean. It went in on the strength of the render counts below, *not* on a demonstrated speed-up, which is the distinction the rest of this section is about.

**What it provably does.** Render counts over 285 ticks, against `KpiCardGrid` as an un-memoised control:

| Component | Renders | vs control |
| :-- | --: | --: |
| `KpiCardGrid` (control) | 308 | — |
| `WaitTimeTrendChart` | 108 | −65% |
| `EconomicsTrendChart` | 108 | −65% |
| `EventLogPanel` | 32 | **−90%** |

Counts are deterministic and load-independent, so this part is solid: the work is genuinely eliminated. From §5's breakdown the expected saving is **~25–30%** — *derived, not measured*.

**What could not be established: any wall-clock improvement.** A controlled A/B said the memoised build was *slower*. Re-running the same build in a different position:

| Run | Build | Position | Median |
| :-- | :-- | :-- | --: |
| A | memoised | 1st | 32.4 ms |
| B | **no memo** | 2nd | 22.1 ms |
| C | memoised | 3rd | **17.5 ms** |

The identical build swung **32.4 → 17.5 ms by position alone**. Order and warm-up dominate the effect entirely; the A-vs-B comparison was measuring machine state, not code. Successive runs drift by more than the effect being looked for.

**So the premise of §5 is itself only as good as this harness.** "Render is 94% of it" came from the same instrument. The breakdown's *relative* shares are trustworthy — they are within-run ratios — and so are the render counts. The absolute millisecond figures are not, beyond the first measurement of the day when the machine was quiet.

**Before option 1 is worth starting**, a measurement rig that can actually resolve the difference: production build, quiet machine, many repetitions, warm-up discarded. Option 1 is a wide diff across the whole UI surface, and doing it without being able to demonstrate it helped is how a refactor becomes unfalsifiable.

---

## 7. Verification status at close

| Check | Result |
| :-- | :-- |
| `npm run typecheck` | clean |
| `npm test` | **132 passed, 8 files** |
| Sim behaviour vs HEAD | identical on every KPI across 20 seeds, twice (§3); hash moved both times, by design |
| Day close in browser | 2,577 → 255 ms; comparison lands, restart re-scores, pending copy verified |
| Stall repro | 60 s at 4× — 1,196 ticks replayed → 12 |
| Working tree | clean at close. |

---

## 8. Open, carried forward

1. **Option 4 shipped without a demonstrated speed-up.** The render counts prove the work is eliminated; the wall-clock benefit is still unmeasured (§6). If the rig is ever built, this is the first thing to point it at — partly to size the win, partly because if it turns out to be nil that is itself a finding about where the time really goes.
2. **The measurement rig** (§6) — the prerequisite for options 1–3 being worth doing.
3. **`runs/` artefacts are two hash-rebasing changes behind.** Gitignored and reproducible; regenerate before the next tester session.
4. **Gate scorecard's criterion 2 table** still shows the 8-seed run, which D38 puts below the evidence floor. The prose says so; the table wants re-issuing at ≥40 seeds. Deferred to the tester pass so the scorecard is re-issued once rather than twice.
5. **Whether a hidden tab should keep trading** — D40 leaves this open deliberately. Today it cannot, and that is a consequence of the loop being driven by rAF rather than a position anyone has taken.
6. **OPEN-1 (playtesters) is still `NOW BLOCKING`** and unmoved by any of today's work.
