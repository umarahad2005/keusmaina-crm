---
description: Phase 3 — Backend CRUD APIs for all Module 1 entities + Auth
---

# Phase 3: Backend CRUD APIs

Create RESTful routes in `server/routes/`. Each route file exports an Express Router.

## Auth Middleware (`server/middleware/auth.js`)
- `protect` — verify JWT from Authorization header, attach user to req
- `authorize(...roles)` — check if req.user.role is allowed

## Audit Middleware (`server/middleware/auditLog.js`)
- Logs create/update/delete actions to AuditLog collection

## Routes to Create

1. **`server/routes/auth.js`** — mounted at `/api/auth`
   - `POST /register` — create user (admin only for now)
   - `POST /login` — validate credentials, return JWT
   - `GET /me` — return current user from token
   - `POST /seed-admin` — one-time admin seed (disable after first use)

2. **`server/routes/airlines.js`** — mounted at `/api/airlines`
   - `GET /` — list all active airlines (with search, pagination)
   - `GET /:id` — single airline
   - `POST /` — create (auth required)
   - `PUT /:id` — update (auth required)
   - `DELETE /:id` — soft delete (set isActive=false)

3. **`server/routes/hotelsMakkah.js`** — `/api/hotels-makkah` (same CRUD pattern)
4. **`server/routes/hotelsMadinah.js`** — `/api/hotels-madinah` (same CRUD pattern)
5. **`server/routes/ziyarats.js`** — `/api/ziyarats` (same CRUD pattern)
6. **`server/routes/transport.js`** — `/api/transport` (same CRUD pattern)
7. **`server/routes/specialServices.js`** — `/api/special-services` (same CRUD pattern)
8. **`server/routes/currency.js`** — `/api/currency`
   - `GET /` — get current rate + history
   - `PUT /` — update rate (admin only), push to history array
   - Auto-recalculate PKR prices across all collections on rate change

## API Response Format
All responses follow:
```json
{ "success": true, "data": {...}, "count": N, "pagination": {...} }
```

## Verification (test with curl)
// turbo
9. Seed admin user:
```bash
curl -X POST http://localhost:5000/api/auth/seed-admin
```
// turbo
10. Login and get token:
```bash
curl -X POST http://localhost:5000/api/auth/login -H "Content-Type: application/json" -d "{\"email\":\"admin@keusmania.com\",\"password\":\"admin123\"}"
```
11. Test airline CRUD with the token from step 10
