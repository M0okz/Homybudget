# Homybudget
A budget app that is both smart and useful.

![alt text](<CleanShot 2026-01-21 at 11.19.19.png>)

Budget tracker with a React + Vite frontend and a Node/Express + PostgreSQL API.

## Features
- 👥 Two-person budgets with income, fixed expenses, and free categories.
- 🔁 Installments that carry over month to month.
- 🧾 Joint account with deposits, expenses, and live balance.
- 🗓️ Month navigation with manual create/delete.
- 💾 Autosave to PostgreSQL (debounced).
- 🔐 JWT login with user accounts and password resets.
- 🖼️ Profile image for each user.

## Tech Stack
- Frontend: React, Vite, TypeScript, Tailwind CSS
- Backend: Node.js, Express, pg
- Database: PostgreSQL

## Project Structure
```
src/                # frontend
server/             # backend API
  index.js          # Express API
  db.js             # PostgreSQL connection
  schema.sql        # DB schema
```

## Requirements
- Node.js 18+
- PostgreSQL 13+

## Setup
1) Install dependencies
```
npm install
```

2) Configure environment
Copy `.env.example` to `.env` and update:
- `DATABASE_URL` (or `PGHOST`, `PGUSER`, etc.)
- `VITE_API_URL` (optional in dev, default proxy is used)

Important: if your password includes special characters (ex: `@`), URL-encode them in `DATABASE_URL`.

3) Create database and schema
```
createdb app_budget
psql -d app_budget -f server/schema.sql
```
Note: the API will auto-init the schema on startup if the database is empty. If you use an external DB where tables already exist (and you are not the owner), the server skips auto-init to avoid permission errors. You can force it with `FORCE_SCHEMA_INIT=true`.

4) Bootstrap the first admin user (only once)
```
curl -X POST http://localhost:3001/api/auth/bootstrap \\
  -H \"Content-Type: application/json\" \\
  -d '{\"username\":\"admin\",\"password\":\"change_me\"}'
```
If no users exist and `ADMIN_USERNAME`/`ADMIN_PASSWORD` are set, the first successful login auto-creates the admin.

5) Run
```
npm run dev:full
```
Or run separately:
```
npm run dev
npm run dev:server
```

Frontend: http://localhost:5173  
API: http://localhost:3001

## Docker Compose
1) Build and start
```
docker compose up --build
```

2) Open the app
```
http://localhost:8080
```

Notes:
- The database is initialized from `server/schema.sql` on first start.
- Update `ADMIN_PASSWORD` and `JWT_SECRET` in `docker-compose.yml` before sharing.
- The Docker image bundles the API + frontend in one container.
- Uploaded profile images are stored in the `uploads-data` Docker volume.

## Environment Variables
- `DATABASE_URL`: full PostgreSQL connection string
- `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`: alternative connection config
- `PORT`: API port (default 3001)
- `CORS_ORIGIN`: allowed frontend origin (default http://localhost:5173)
- `ADMIN_USERNAME`: initial admin username (bootstrap/login)
- `ADMIN_PASSWORD`: initial admin password (bootstrap/login)
- `JWT_SECRET`: JWT signing secret
- `PASSWORD_MIN_LENGTH`: minimum password length (default 8)
- `PASSWORD_RESET_TOKEN_TTL_MINUTES`: reset token expiry (default 60)
- `VITE_API_URL`: frontend API base URL (optional)

## API
See `api.md` for endpoints, auth, and server configuration.

## Notes
- Frontend auto-saves the current month (debounced).
