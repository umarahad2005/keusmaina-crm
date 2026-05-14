---
description: Phase 5 — Frontend CRUD UIs for all Module 1 data types
---

# Phase 5: Module 1 CRUD UIs

## Reusable Components

1. **`client/src/components/DataTable.jsx`**
   - Props: columns, data, onEdit, onDelete, searchable, sortable, paginated
   - Striped rows, hover effect, status badge for Active/Inactive
   - Search bar filters across all text columns
   - Pagination controls (10/25/50 per page)

2. **`client/src/components/FormModal.jsx`**
   - Slide-in modal from right (or centered modal)
   - Dynamic form fields from config array
   - Validation before submit
   - SAR input → auto-show PKR equivalent

3. **`client/src/components/CurrencyDisplay.jsx`**
   - Shows `SAR X.XX | PKR Y,YYY` side by side
   - Uses CurrencyContext for conversion

4. **`client/src/components/StatusBadge.jsx`**
   - Green "Active" / Red "Inactive" pill badges

## CRUD Pages (all follow same pattern)

Each page:
- Header with title + "Add New" gold button
- DataTable showing all records
- Click "Add" or "Edit" → opens FormModal
- Delete → confirm dialog → soft-delete (mark inactive)
- Toast notification on success/error

5. **`client/src/pages/data/Airlines.jsx`**
   - Table columns: Name, Flight#, Route, Class, Price (SAR/PKR), Status
   - Form: all fields from Module 1A spec

6. **`client/src/pages/data/HotelsMakkah.jsx`**
   - Table: Name, Stars, Distance, Rooms, Status
   - Form: includes dynamic "Add Room Type" sub-form

7. **`client/src/pages/data/HotelsMadinah.jsx`** — Same as Makkah

8. **`client/src/pages/data/Ziyarats.jsx`**
   - Table: Name, Location, Duration, Rate, Status

9. **`client/src/pages/data/Transport.jsx`**
   - Table: Type, Route, Capacity, Rate, Status

10. **`client/src/pages/data/SpecialServices.jsx`**
    - Table: Name, Rate, Pricing Type, Status

11. **`client/src/pages/data/CurrencySettings.jsx`**
    - Current rate display (large)
    - Update form (admin only)
    - Rate history table

## Verification
12. Open each CRUD page in browser
13. Add sample data for each entity type
14. Edit an entry → verify changes persist
15. Soft-delete → verify item shows as "Inactive"
16. Test search and pagination with multiple records
