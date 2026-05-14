---
description: Phase 1 — Project Scaffolding (Backend + Frontend + DB Connection)
---

# Phase 1: Project Scaffolding

## Backend Setup

// turbo
1. Create `server/` directory and initialize npm:
```bash
cd d:\keusmania_crm && mkdir server && cd server && npm init -y
```

// turbo
2. Install backend dependencies:
```bash
cd d:\keusmania_crm\server && npm install express mongoose dotenv cors bcryptjs jsonwebtoken joi morgan helmet express-rate-limit
```

// turbo
3. Install dev dependencies:
```bash
cd d:\keusmania_crm\server && npm install -D nodemon
```

4. Create `server/server.js` with:
   - Express app with JSON middleware, CORS, morgan logging, helmet
   - MongoDB connection via Mongoose
   - Route mounting for all modules under `/api/`
   - Error handling middleware
   - Port from env or 5000

5. Create `server/.env` with:
   - `MONGO_URI=mongodb://localhost:27017/keusmania_crm`
   - `JWT_SECRET=keusmania_secret_key_change_in_production`
   - `PORT=5000`

6. Add scripts to `server/package.json`:
   - `"dev": "nodemon server.js"`
   - `"start": "node server.js"`

## Frontend Setup

// turbo
7. Initialize Vite + React in `client/`:
```bash
cd d:\keusmania_crm && npx -y create-vite@latest client -- --template react
```

// turbo
8. Install frontend dependencies:
```bash
cd d:\keusmania_crm\client && npm install && npm install axios react-router-dom recharts react-icons react-hot-toast xlsx html2pdf.js
```

// turbo
9. Install TailwindCSS v3:
```bash
cd d:\keusmania_crm\client && npm install -D tailwindcss@3 postcss autoprefixer && npx tailwindcss init -p
```

10. Configure `tailwind.config.js` with brand colors:
    - Navy: `#1B2A6B`, Gold: `#D4A017`, Green: `#2E7D32`
    - Font families: Inter, Playfair Display, Noto Nastaliq Urdu

11. Update `client/src/index.css` with Tailwind directives and global styles

12. Copy logo to `client/public/assets/karwan-e-usmania-logo.png`

## Verification
// turbo
13. Start backend: `cd d:\keusmania_crm\server && npm run dev` → confirm "MongoDB connected" message
// turbo
14. Start frontend: `cd d:\keusmania_crm\client && npm run dev` → confirm Vite serves React app
