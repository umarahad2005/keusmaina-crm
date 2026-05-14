---
description: Phase 4 — Frontend Foundation (Design System, Layout, Auth, Routing)
---

# Phase 4: Frontend Foundation

## Design System (`client/src/index.css`)
- Brand colors as CSS custom properties and Tailwind theme
- Typography: Inter (body), Playfair Display (headings)
- Utility classes for cards, badges, buttons (gold, navy, green variants)
- Animations: fade-in, slide-in for page transitions

## Layout Components

1. **`client/src/layouts/MainLayout.jsx`**
   - Fixed navy sidebar (left) + white content area (right)
   - Responsive: sidebar collapses to hamburger on mobile
   - Outlet for nested routes

2. **`client/src/components/Sidebar.jsx`**
   - Agency logo at top
   - Navigation links with icons (react-icons):
     - 📊 Dashboard
     - ✈️ Airlines | 🏨 Hotels Makkah | 🏨 Hotels Madinah | 🕌 Ziyarats | 🚌 Transport | ⭐ Services
     - 📦 Packages | 👥 Clients
     - 💰 Ledger
     - 📈 Reports
     - ⚙️ Settings (Currency, Users)
   - Active state highlight (gold left border + light bg)
   - Role-based: hide items based on user role

3. **`client/src/components/Topbar.jsx`**
   - Current page breadcrumb
   - Language toggle (EN / اردو)
   - Current SAR→PKR rate display
   - User avatar + dropdown (profile, logout)

## Auth

4. **`client/src/pages/Login.jsx`**
   - Centered card with large logo, navy background
   - Email + password form with gold submit button
   - Error toast on invalid credentials

5. **`client/src/context/AuthContext.jsx`**
   - Login/logout functions, store JWT in localStorage
   - Wrap app in AuthProvider
   - ProtectedRoute component

6. **`client/src/context/CurrencyContext.jsx`**
   - Fetch current SAR rate on mount, provide to all components
   - `convertToPKR(sarAmount)` helper

## Routing (`client/src/App.jsx`)
- `/login` — public
- `/` — Dashboard (protected)
- `/airlines`, `/hotels-makkah`, etc. — Module 1 pages
- `/packages`, `/clients` — Module 2
- `/ledger` — Module 3
- `/reports` — Module 4
- `/settings` — Currency + Users

## Utility
7. **`client/src/utils/api.js`**
   - Axios instance with `baseURL` from env
   - Request interceptor to attach JWT
   - Response interceptor for 401 → redirect to login

## Verification
8. Start dev server and navigate to login page in browser
9. Login with admin credentials → verify sidebar + dashboard skeleton appear
10. Check responsive layout on mobile viewport
