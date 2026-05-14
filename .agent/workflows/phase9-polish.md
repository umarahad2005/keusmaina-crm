---
description: Phase 9 — Polish — RBAC, i18n (Urdu), RTL, Mobile, WhatsApp share
---

# Phase 9: Polish & Advanced Features

## Role-Based Access Control

1. Update `server/middleware/auth.js` `authorize()` to enforce:
   | Role | Access |
   |---|---|
   | admin | Full access |
   | sales | Packages + Clients only |
   | accounts | Ledger + Reports |
   | visa | Client docs + visa status |
   | operations | Read-only all modules |

2. Update `client/src/components/Sidebar.jsx` — hide nav items per role
3. Add route guards on frontend for unauthorized paths

## Internationalization (i18n)

4. **`client/src/i18n/en.json`** — English labels for all UI strings
5. **`client/src/i18n/ur.json`** — Urdu translations for all labels
6. **`client/src/context/LanguageContext.jsx`** — toggle state, load translations
7. Apply `dir="rtl"` to `<html>` when Urdu is selected
8. Add RTL-specific CSS (flip sidebar to right, text alignment, etc.)

## Mobile Responsiveness

9. Audit all pages at 375px and 768px breakpoints
10. Sidebar → collapsible drawer with hamburger icon
11. DataTable → horizontal scroll on mobile
12. Forms → single column stack on mobile
13. Dashboard cards → 1 column on mobile, 2 on tablet

## WhatsApp Share

14. Generate WhatsApp share link: `https://wa.me/?text=` with voucher summary
15. Add WhatsApp icon button on voucher detail page

## Audit Log Viewer

16. **`client/src/pages/AuditLog.jsx`** — Admin-only page
    - Table: User, Action, Entity, Date
    - Filter by user, action, entity type, date range

## Verification
17. Login as each role → verify access restrictions
18. Toggle to Urdu → verify labels + RTL layout
19. Resize browser to mobile → verify responsive layout
20. Share a voucher via WhatsApp → verify link opens correctly
