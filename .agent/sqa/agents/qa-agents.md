# QA Agents — roster & test matrix

Each QA agent owns one area of the CRM. It runs independently, and for every
check it records a verdict (`pass` / `fail`) plus, **on failure, a screenshot**
saved to `results/screenshots/<agent>__<check>.png`. Verdicts are aggregated in
`results/report.json` (schema at the bottom).

Add a new agent by dropping a `tests/<agent>.spec.js` file that follows the same
shape as `tests/smoke.spec.js` and tagging each test with the agent name.

---

## 1. `auth` — authentication & sessions
- Login with valid admin credentials → lands on dashboard.
- Login with wrong password → shows "Invalid credentials", stays on /login.
- Protected route while logged out (e.g. `/ledger`) → redirected to /login.
- Logout clears the session (localStorage token gone, back button can't re-enter).
- **Lockout:** 8 wrong passwords in a row → 429 "Too many failed attempts".

## 2. `access-control` — role-based permissions (verifies the security sweep)
Logs in as a **non-finance** role (e.g. `operations`) and asserts:
- Creating/editing a **cash account** is refused (403).
- Editing a **ledger entry** or **expense** is refused (403).
- Reading dashboards still works (read is open).
- A `sales` user CAN record a client payment but CANNOT delete a ledger entry.
> This is the regression guard for `middleware/roles.js`.

## 3. `finance` — cash accounts, ledger, refunds (highest priority)
- Create a cash account → appears in the list with balance 0.
- Record a client **payment** (credit) into that account → account balance goes **up**.
- Record a **refund** (category = refund) → must force account selection; account balance goes **down**.
- Account **detail** running balance == the **list** balance for the same account (no mismatch).
- Opening balance edit is admin-only (non-admin field is ignored/blocked).
- Delete an account with transactions → soft-deactivates (history kept).

## 4. `packages` — package builder & pricing
- Create a package with components → price is computed server-side.
- Attempt to PUT a package with a forged `pricingSummary` (via API) → server ignores it, price stays correct.
- Add / remove a pilgrim from the roster → count updates.
- Cancel a package → status = cancelled, seats released.

## 5. `payments-alerts` — payment-before-travel board
- `GET /api/reports/payment-alerts` returns packages with a balance, sorted by urgency.
- A package travelling within the warn window with a balance is flagged `due_soon`/`overdue`.
- A fully-paid package does **not** appear in the alerts.

## 6. `clients` — B2C / B2B CRM
- Create, edit, search, soft-delete a B2C pilgrim and a B2B agent.
- Search box uses a safe query (no crash on regex characters like `.*(`).

## 7. `visas` — visa tracker
- Visa board loads and filters by status.
- Update a pilgrim's visa status → timeline entry added; passport-expiry flags show.

## 8. `departures` — departure batches & manifest
- Create a departure, link a package, view the batch manifest and profit.

## 9. `reports` — dashboard
- `/api/reports/overview` and the dashboard widgets load without error.
- Dashboard cash-on-hand total == the accounts page total (single source of truth).

## 10. `api-health` — smoke
- `GET /api/health` returns `{ success: true }` within 10s.
- Every list endpoint honours a clamped `limit` (e.g. `?limit=100000000` does not hang).

---

## report.json schema (what fix agents consume)

```json
{
  "runId": "2026-07-21T16-40-00Z",
  "baseUrl": "http://localhost:5173",
  "summary": { "total": 42, "passed": 39, "failed": 3 },
  "checks": [
    {
      "agent": "finance",
      "check": "refund-lowers-account-balance",
      "status": "fail",
      "severity": "high",
      "expected": "account balance decreases by refund amount",
      "actual": "balance unchanged",
      "screenshot": "results/screenshots/finance__refund-lowers-account-balance.png",
      "location": { "spec": "tests/finance.spec.js", "line": 88 },
      "consoleErrors": ["..."],
      "apiFailures": [{ "url": "/api/cash-accounts/ID", "status": 500 }]
    }
  ]
}
```
