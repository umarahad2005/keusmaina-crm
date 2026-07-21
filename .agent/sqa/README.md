# SQA — Automated Multi-Agent QA & Auto-Fix System

A two-stage agent pipeline for the Karwan-e-Usmania CRM:

1. **QA agents** drive the running app end-to-end, check every workflow, and
   **screenshot any issue as proof** into `results/`.
2. **Fix agents** read those results, repair the code, and re-run the failing
   check to confirm the fix.

```
                 ┌─────────────────────────────────────────┐
                 │  npm run sqa   (orchestrator)            │
                 └───────────────┬─────────────────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          ▼                      ▼                        ▼
   ┌────────────┐        ┌────────────┐           ┌────────────┐
   │ QA agent   │  ...   │ QA agent   │   ...      │ QA agent   │   (run in parallel)
   │ auth       │        │ finance    │           │ packages   │
   └─────┬──────┘        └─────┬──────┘           └─────┬──────┘
         │  screenshot + JSON verdict per check         │
         └──────────────┬───────────────────────────────┘
                        ▼
              results/report.json  +  results/screenshots/*.png
                        │
                        ▼
                 ┌────────────┐   one fix agent per FAILED check
                 │ Fix agents │ → edits code → re-runs that check → confirms
                 └────────────┘
```

## Folder layout

```
.agent/sqa/
  README.md                  ← you are here (system design + how to run)
  agents/
    qa-agents.md             ← the QA agent roster: scope, checks, evidence rules
    fix-agents.md            ← the fix pipeline: triage → repair → verify
  runner/
    package.json             ← Playwright deps + npm scripts
    playwright.config.js     ← screenshots on failure, HTML + JSON report
    tests/
      smoke.spec.js          ← seed test (login + dashboard) — pattern to copy
    fixtures/
      auth.js                ← shared login helper
  results/                   ← auto-generated (gitignored)
    report.json              ← machine-readable pass/fail per check
    screenshots/             ← PROOF: one PNG per failing step
    report-html/             ← human-readable Playwright report
```

## How to run

Prereqs (one time):
```bash
cd .agent/sqa/runner
npm install
npx playwright install chromium
```

Point it at the app and run:
```bash
# local dev — UI on :5173, API on :5000 (different origins)
SQA_BASE_URL=http://localhost:5173 SQA_API_URL=http://localhost:5000 npm run sqa

# deployed site once it's live — UI and API share one origin
SQA_BASE_URL=https://keusmaina-crm.vercel.app npm run sqa
```

- **`SQA_BASE_URL`** — where the **UI** lives (used by the browser/page tests).
- **`SQA_API_URL`** — where the **API** lives (used by the API tests). Defaults to
  `SQA_BASE_URL`, then `http://localhost:5000`. Set it only when the API is on a
  different origin than the UI (i.e. local dev).

- **`npm run sqa`** — run all QA agents, write `results/report.json` + screenshots.
- **`npm run sqa:report`** — open the HTML report of the last run.
- **`npm run sqa:fix`** — hand `results/report.json` to the fix agents (see `agents/fix-agents.md`).

## Credentials

The runner logs in with `SQA_EMAIL` / `SQA_PASSWORD` (default `admin@keusmania.com` /
`admin123`). Use a dedicated test account in a non-production database — the QA
agents create and delete records.

## Design principles

- **Evidence or it didn't happen** — every failed check saves a screenshot to
  `results/screenshots/<agent>__<check>.png`. That PNG is the proof handed to the
  fix agent.
- **Isolated data** — QA agents create their own records with a `SQA-` prefix and
  clean them up, so runs are repeatable.
- **Deterministic** — no reliance on pre-existing data; each agent seeds what it needs.
- **Fix, then re-verify** — a fix agent never reports "done" until it re-runs the
  exact failing check and it turns green.
