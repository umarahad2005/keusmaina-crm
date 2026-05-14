---
description: Phase 2 — Database Models for all Module 1 entities + Users + AuditLog
---

# Phase 2: Database Models

Create all Mongoose models in `server/models/`. Every model includes:
- `isActive: { type: Boolean, default: true }` for soft delete
- `timestamps: true` in schema options
- `createdBy` and `updatedBy` fields (ObjectId ref to User)

## Models to Create

1. **`server/models/Airline.js`**
   - name (String, required), flightNumber, departureCity, departureAirportCode
   - arrivalCity, arrivalAirportCode, departureDateTime, arrivalDateTime
   - seatClass (enum: Economy/Business/First), ticketPriceSAR (Number)
   - ticketPricePKR (Number, virtual/computed), baggageAllowance (Number)
   - transitDetails (String), notes, isActive

2. **`server/models/HotelMakkah.js`**
   - name, starRating (1-5), distanceFromHaram (String)
   - roomTypes: [{ typeName, rateSAR, ratePKR, maxOccupancy, mealPlan (enum) }]
   - totalRooms, checkInPolicy, checkOutPolicy, notes, isActive

3. **`server/models/HotelMadinah.js`**
   - Same as Makkah but `distanceFromMasjidNabawi`

4. **`server/models/Ziyarat.js`**
   - name, location (enum: Makkah/Madinah/Other), duration, transportIncluded (Boolean)
   - ratePerPersonSAR/PKR, ratePerGroupSAR/PKR, description, isActive

5. **`server/models/Transport.js`**
   - typeName, route, capacity, ratePerPersonSAR/PKR, ratePerVehicleSAR/PKR
   - vendor, notes, isActive

6. **`server/models/SpecialService.js`**
   - name, rateSAR/PKR, pricingType (enum: perPerson/perGroup/fixed)
   - description, isActive

7. **`server/models/CurrencySettings.js`**
   - sarToPkr (Number, required), updatedBy (ref User)
   - rateHistory: [{ rate, date, updatedBy }]
   - This is a singleton document (only one)

8. **`server/models/User.js`**
   - name, email (unique), password (hashed with bcrypt pre-save hook)
   - role (enum: admin/sales/accounts/visa/operations), isActive

9. **`server/models/AuditLog.js`**
   - userId (ref User), action (create/update/delete), entity, entityId
   - changes (Mixed — old/new values), timestamp

## Verification
// turbo
10. Run backend and import all models to confirm no schema errors:
```bash
cd d:\keusmania_crm\server && node -e "require('./models/Airline'); require('./models/HotelMakkah'); require('./models/HotelMadinah'); require('./models/Ziyarat'); require('./models/Transport'); require('./models/SpecialService'); require('./models/CurrencySettings'); require('./models/User'); require('./models/AuditLog'); console.log('All models loaded OK')"
```
