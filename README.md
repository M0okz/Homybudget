# Homybudget
<<<<<<< HEAD
A budget app that is both smart and useful.
=======

Budget tracker with a React + Vite frontend and a Node/Express + PostgreSQL API.

## Features
- Two-person monthly budgets with income, fixed expenses, and free categories.
- Recurring categories (installments) with month-based carryover.
- Joint account (deposits/expenses) with balance calculation.
- Month navigation and explicit month creation/deletion.
- Autosave to PostgreSQL with debounced writes.
- JWT authentication with user accounts and password resets.

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

## API Endpoints
- `POST /api/auth/bootstrap` - create the first admin user (only when DB is empty)
- `POST /api/auth/login` - login and return JWT
- `POST /api/auth/request-reset` - request a password reset token
- `POST /api/auth/reset` - reset password with a token
- `POST /api/auth/change-password` - change password for the current user
- `GET /api/users/me` - current user profile
- `GET /api/users` - list users (admin only)
- `POST /api/users` - create user (admin only)
- `PATCH /api/users/:userId` - update user (admin only)
- `POST /api/users/:userId/reset-password` - create reset token for a user (admin only)
- `GET /api/health` - DB connectivity
- `GET /api/months` - list all months
- `GET /api/months/:monthKey` - get a month
- `PUT /api/months/:monthKey` - create/update a month
- `DELETE /api/months/:monthKey` - delete a month

`monthKey` format: `YYYY-MM`

## Notes
- Vite dev server proxies `/api` to `http://localhost:3001`.
- Frontend auto-saves the current month (debounced).
- Password reset tokens are returned in API responses.
>>>>>>> e5af143 (Initial commit)
