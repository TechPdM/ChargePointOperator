# Security Review: Dependencies (2026-10-24)

Status: **All vulnerabilities fixed, committed in `019a937`.** `npm audit` reports **0 vulnerabilities**.
Changed files: `package-lock.json` (audit fix + vitest 5) and `package.json` (vitest `^2.1.8` →
`^5.0.5`). See §5 for the vitest 5 upgrade.

Part of a review of every project in `~/Dev`; the overall report is in
`~/Dev/SecurityReview/2026-10-24/`.

## 1. Findings (before changes)

| Tool | Critical | High | Moderate/Medium | Low | Total |
|---|---:|---:|---:|---:|---:|
| OSV-Scanner 2.7.0 (`package-lock.json`) | 3 | 4 | 12 | 2 | 21 advisory groups, 6 packages |
| `npm audit` | 2 | 2 | 3 | 0 | 7 packages |

(OSV counts advisories, npm counts packages.)

### Critical

| Package | Version | Issue |
|---|---|---|
| tinypool | 1.1.1 | Prototype-pollution gadget leading to RCE (two advisories) |
| vitest | 2.1.9 | Arbitrary file read/execute while the Vitest UI server is listening |

Both are **dev/test tooling only**. They are exposed only while tests or the Vitest UI are
running, and are not part of the built game.

## 2. Baseline before changes

On `83f368e`, clean working tree:

- `tsc --noEmit`: exit 0
- `vitest run`: 8 files, 154 tests passed
- `vite build`: succeeded (built to a scratch directory, so `dist/` was not touched)

`package-lock.json` was backed up before any change.

## 3. What was done

1. `npm audit fix --dry-run`: proposed only 2 changes, no removals:
   - `vite` 6.4.3 → 6.4.5
   - `source-map-js` 1.2.1 → 1.2.2
2. `npm audit fix` applied those two changes.
3. Re-ran the checks, all green:
   - `tsc --noEmit`: exit 0
   - `vitest run`: 154/154 passed
   - `vite build`: succeeded

## 4. Result

| | Before | After |
|---|---|---|
| npm audit | 7 (2 critical, 2 high, 3 moderate) | 6 (2 critical, 1 high, 3 moderate) |
| Typecheck | ✓ | ✓ |
| Tests | 154/154 | 154/154 |
| Build | ✓ | ✓ |

## 5. Remaining after the audit fix (now fixed by vitest 5, below)

| Severity | Package | Why it's still here |
|---|---|---|
| Critical | vitest | installed 2.1.9; fix requires vitest 5 |
| Critical | tinypool | dependency of vitest 2 |
| High | vite | old copy pulled in by vitest 2 (the app's own vite is fixed) |
| Moderate | @vitest/mocker | part of vitest 2 |
| Moderate | vite-node | part of vitest 2 |
| Moderate | esbuild | old copy pulled in by vitest 2's vite |

### vitest 2 → 5 upgrade (done)

**Compatibility checked first:** vitest 5.0.5 accepts vite `^6.4 || ^7 || ^8` (this project has
6.4.5), Node `^22.12 || ^24 || >=26` (this machine has 26.12). `vitest.config.ts` only sets
`include`, `environment: "node"` and `testTimeout`, all unchanged in vitest 5.

```bash
npm install -D vitest@^5.0.5 --prefix /Users/mark/Dev/ChargePointOperator
```

Result: 4 packages added, 24 removed (vitest 2 internals, including tinypool, vite-node and the
old bundled vite/esbuild), 11 changed; **found 0 vulnerabilities**.

| Check | vitest 2.1.9 | vitest 5.0.5 |
|---|---|---|
| `vitest run` | 154/154 | ✓ 154/154 |
| `tsc --noEmit` | ✓ | ✓ |
| `vite build` | ✓ | ✓ |

No config or test changes were needed.

Other outdated packages noted (not security-related): `@vitejs/plugin-react` 4 → 6, `vite` 6 → 8,
`typescript` 5 → 7.

## 6. Undo

Undo only the vitest 5 upgrade (keep the audit fix; needs the backups outside this repo):

```bash
cp /Users/mark/Dev/SecurityReview/2026-10-24/backups-before-vitest5/ChargePointOperator/package.json /Users/mark/Dev/ChargePointOperator/package.json
cp /Users/mark/Dev/SecurityReview/2026-10-24/backups-before-vitest5/ChargePointOperator/package-lock.json /Users/mark/Dev/ChargePointOperator/package-lock.json
npm ci --prefix /Users/mark/Dev/ChargePointOperator
```

Undo everything from this review:

```bash
git -C /Users/mark/Dev/ChargePointOperator revert 019a937
npm ci --prefix /Users/mark/Dev/ChargePointOperator
```

## 7. Re-check

```bash
npm audit --prefix /Users/mark/Dev/ChargePointOperator
osv-scanner scan source --lockfile /Users/mark/Dev/ChargePointOperator/package-lock.json
```
