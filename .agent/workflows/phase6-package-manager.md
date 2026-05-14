---
description: Phase 6 — Package Manager (Module 2) — Vouchers, Clients B2B/B2C, PDF
---

# Phase 6: Package Manager (Module 2)

## Backend

1. **`server/models/Package.js`**
   - voucherId: auto-generated `KU-YYYY-NNNN` (use counter collection or pre-save hook)
   - packageName, packageType (enum: Umrah/Ziyarat/Custom/VIP)
   - travelSeason, duration, numberOfPilgrims
   - components: { airline (ref), makkahHotel (ref + roomType + nights), madinahHotel (ref + roomType + nights), ziyarats [refs], transportation [refs], specialServices [refs] }
   - pricingSummary: { componentBreakdown, subtotalSAR, subtotalPKR, markupType, markupValue, finalPriceSAR, finalPricePKR, costPerPerson }
   - client (ref to B2C or B2B), clientType (enum: B2C/B2B)
   - createdBy, isActive, timestamps

2. **`server/models/ClientB2C.js`**
   - fullName, cnic, passportNumber, passportExpiry, dob, gender
   - mahramDetails: { name, relation, cnic } — required if gender=Female
   - phone, address, emergencyContact, createdBy, isActive

3. **`server/models/ClientB2B.js`**
   - companyName, contactPerson, phone, whatsapp, email, city
   - commissionType (enum: percentage/fixed), commissionValue
   - agentCode (auto: AG-NNNN)
   - subPilgrims: [{ same fields as B2C }]
   - createdBy, isActive

4. **`server/routes/packages.js`**
   - CRUD + pricing engine endpoint that calculates totals from component refs
   - GET with populate for full component details

5. **`server/routes/clients.js`**
   - B2C + B2B CRUD under `/api/clients/b2c` and `/api/clients/b2b`

## Frontend

6. **`client/src/pages/packages/PackageWizard.jsx`**
   - Step 1: Basic info (name, type, season, duration, pilgrims)
   - Step 2: Select airline (dropdown from Module 1A data)
   - Step 3: Select Makkah hotel + room type + nights
   - Step 4: Select Madinah hotel + room type + nights
   - Step 5: Select ziyarats (multi-checkbox)
   - Step 6: Select transport (multi-checkbox)
   - Step 7: Select special services (multi-checkbox)
   - Step 8: Review pricing breakdown + set markup → Final price
   - Step 9: Attach client (B2C or B2B) → Save
   - Progress bar at top, prev/next navigation

7. **`client/src/pages/packages/PackageList.jsx`**
   - Table: Voucher ID, Name, Type, Client, Total PKR, Status
   - Click row → view full voucher detail
   - Print PDF button

8. **`client/src/pages/clients/ClientForm.jsx`**
   - Toggle B2C / B2B at top
   - B2C: pilgrim fields + Mahram section (conditionally shown)
   - B2B: agent fields + dynamic pilgrim list

9. **`client/src/pages/clients/ClientList.jsx`**
   - Tabs: B2C | B2B
   - Search, filter, paginate

## PDF Voucher
10. Generate PDF using html2pdf.js:
    - Agency logo header
    - Voucher ID, client name, date
    - Full component breakdown table
    - Pricing summary
    - Payment summary from ledger

## Verification
11. Create a package via the wizard with sample data
12. Verify pricing auto-calculates correctly
13. Attach a B2C client with female gender → verify Mahram validation
14. Generate and download PDF voucher
