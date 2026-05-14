---
description: Phase 8 — Reporting Dashboard (Module 4) — Charts, Metrics, Export
---

# Phase 8: Reporting Dashboard (Module 4)

## Backend Aggregation Endpoints

1. **`server/routes/reports.js`** — mounted at `/api/reports`
   - `GET /overview` — total packages, pilgrims, revenue, outstanding, B2B count, B2C count
   - `GET /revenue/monthly` — monthly revenue bar chart data
   - `GET /revenue/by-type` — revenue by package type (pie)
   - `GET /collection-vs-outstanding` — collected vs pending (pie)
   - `GET /agent-revenue` — per-agent revenue contribution
   - `GET /packages-per-month` — packages created per month
   - `GET /hotel-bookings` — hotel-wise booking counts
   - `GET /airline-bookings` — airline-wise booking counts
   - `GET /client-stats` — new clients, B2B vs B2C ratio, repeats

## Frontend

2. **`client/src/pages/Dashboard.jsx`**
   - **Overview Cards** (top row): 6 metric cards with icons, animated counters
     - Total Active Packages, Total Pilgrims, Total Revenue (PKR), Outstanding (PKR), B2B Agents, B2C Clients
   - **Charts Row 1**: Monthly Revenue (Bar) + Collection vs Outstanding (Donut)
   - **Charts Row 2**: Revenue by Type (Pie) + Packages per Month (Line)
   - **Recent Activity**: Latest 5 packages created, latest 5 payments received

3. **`client/src/components/charts/RevenueChart.jsx`** — Recharts BarChart
4. **`client/src/components/charts/CollectionPie.jsx`** — Recharts PieChart
5. **`client/src/components/charts/PackageTrend.jsx`** — Recharts LineChart

6. **`client/src/pages/Reports.jsx`** — Full reports page with filters
   - Date range picker
   - Report type selector
   - Export buttons: PDF (html2pdf.js) + Excel (xlsx)

## Export Utilities

7. **`client/src/utils/exportPdf.js`** — html2pdf.js wrapper
8. **`client/src/utils/exportExcel.js`** — xlsx library wrapper, converts table data to .xlsx

## Verification
9. Navigate to dashboard → verify all 6 overview cards show live data
10. Check charts render correctly with sample data
11. Export a report to PDF → verify layout and branding
12. Export a table to Excel → verify data integrity
