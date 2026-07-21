# Fix Agents — triage → repair → verify

The fix stage turns `results/report.json` into code changes. It runs **after** the
QA stage and only acts on `status: "fail"` checks.

## Pipeline

```
results/report.json
      │  (only failed checks)
      ▼
┌──────────────┐   1. TRIAGE
│ triage agent │   Group failures, rank by severity (high → low), de-dupe
└──────┬───────┘   failures that share one root cause.
       │
       ▼   one fix agent per root cause (run in parallel, isolated worktrees)
┌──────────────┐   2. REPAIR
│  fix agent   │   • Read the screenshot + expected/actual + console/API errors
│  (per issue) │   • Locate the code from `location` + the failing API route
└──────┬───────┘   • Make the smallest correct change; match surrounding style
       │
       ▼   3. VERIFY (mandatory — no "done" without this)
┌──────────────┐   Re-run ONLY the failing check:
│ verify step  │   `npm run sqa -- --grep "<agent> <check>"`
└──────┬───────┘   Green → keep. Still red → revert, mark `needs-human`.
       │
       ▼
results/fixes.json   (what changed, per issue, with the re-run verdict)
```

## Each fix agent receives

- The single failed check object from `report.json`.
- Its **screenshot** (visual proof of the defect).
- `consoleErrors` and `apiFailures` captured during the run.
- Read/Edit access to `server/` and `client/`.

## Rules

1. **Reproduce before repairing** — re-run the failing check once to confirm it
   fails on the current tree before touching code.
2. **Smallest correct change** — fix the root cause, not the symptom; never edit
   the test to make it pass.
3. **One root cause per agent** — if triage merged 3 failures into one cause, the
   single fix must clear all 3 on re-verify.
4. **Verify or revert** — re-run the exact check. If it doesn't go green, revert
   the change and flag `needs-human` with a one-line reason. Never leave a
   half-applied fix.
5. **No scope creep** — a fix agent touches only files implicated by its issue.
6. **Report honestly** — record `fixed`, `no_change_needed`, or `needs-human` per
   issue in `results/fixes.json`.

## Severity → routing

| Severity | Examples | Handling |
|---|---|---|
| **high** | wrong money math, auth bypass, 500s, data loss | fix first, verify twice |
| **medium** | wrong filter, stale total, missing validation | fix, verify once |
| **low** | copy/label, minor UI | batch, verify the group |

## fixes.json schema

```json
{
  "runId": "2026-07-21T16-40-00Z",
  "fixes": [
    {
      "check": "finance / refund-lowers-account-balance",
      "rootCause": "buildBalanceMap ignored client debit outflow",
      "filesChanged": ["server/routes/cashAccounts.js"],
      "outcome": "fixed",
      "reVerify": "pass"
    }
  ]
}
```

## Orchestration note

The runnable glue (spawning triage + per-issue fix agents) is invoked with
`npm run sqa:fix`, which reads `results/report.json` and drives the agents. Until
that script is wired, this file is the spec a human or a Claude Code session
follows to perform the same steps by hand.
