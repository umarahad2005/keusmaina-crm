---
description: Phase 7 — Ledger & Accounts (Module 3) — Credit/Debit/Balance tracking
---

# Phase 7: Ledger & Accounts (Module 3)

## Backend

1. **`server/models/Ledger.js`**
   - clientId (ref to B2C or B2B), clientType (enum)
   - voucherId (ref to Package, optional for standalone entries)
   - entries: [{ date, description, credit, debit, runningBalance, paymentMethod (enum: Cash/BankTransfer/Online), receivedBy, remarks }]
   - openingBalance, currentBalance (auto-computed)
   - isActive, timestamps

2. **`server/routes/ledger.js`**
   - `POST /api/ledger` — create new ledger for a client
   - `POST /api/ledger/:id/entry` — add credit/debit entry, auto-calculate running balance
   - `GET /api/ledger/client/:clientId` — get client's full statement
   - `GET /api/ledger/pending` — all accounts with outstanding balance > 0
   - `GET /api/ledger/paid` — all fully paid accounts
   - `GET /api/ledger/overdue` — outstanding past due date

## Frontend

3. **`client/src/pages/ledger/ClientLedger.jsx`**
   - Select client (B2C) from dropdown or search
   - Show statement: table with Date, Description, Credit, Debit, Balance
   - "Add Entry" form at bottom
   - Print statement button

4. **`client/src/pages/ledger/AgentLedger.jsx`**
   - Select agent (B2B)
   - Show all associated vouchers
   - Total booking value, commission earned
   - Payment entries & net payable/receivable
   - Print statement

5. **`client/src/pages/ledger/LedgerViews.jsx`**
   - Tabs: Pending | Fully Paid | Overdue
   - Table with client name, total due, paid, balance
   - Click row → jump to individual statement

## Verification
6. Create ledger for a sample client
7. Add credit (payment received) → verify running balance decreases
8. Add debit (additional charge) → verify balance increases
9. Check pending/paid/overdue views filter correctly
10. Print a statement → verify PDF output
