# Homybudget API

## Base URL
- Local dev: `http://localhost:3001`
- Docker compose (single container): `http://localhost:8080` with `/api` proxy

## Auth
- `POST /api/auth/login` (or `POST /api/login`) returns a JWT token.
- Use `Authorization: Bearer <token>` on protected routes.
- `GET /api/auth/bootstrap-status` returns whether a user exists.

## Environment Variables
- `PORT`: API port (default 3001)
- `CORS_ORIGIN`: allowed frontend origin (default http://localhost:5173)
- `ADMIN_USERNAME`: initial admin username (bootstrap/login)
- `ADMIN_PASSWORD`: initial admin password (bootstrap/login)
- `JWT_SECRET`: JWT signing secret
- `PASSWORD_MIN_LENGTH`: minimum password length (default 8)
- `PASSWORD_RESET_TOKEN_TTL_MINUTES`: reset token expiry (default 60)
- `DATABASE_URL`: full PostgreSQL connection string
- `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`: alternative connection config

## Endpoints
- `POST /api/auth/bootstrap` - create the first admin user (only when DB is empty)
- `POST /api/auth/login` - login and return JWT
- `POST /api/auth/request-reset` - request a password reset token
- `POST /api/auth/reset` - reset password with a token
- `POST /api/auth/change-password` - change password for the current user
- `GET /api/settings` - fetch global app settings
- `PATCH /api/settings` - update global app settings
- `GET /api/users/me` - current user profile
- `PATCH /api/users/me` - update current user profile (display name / avatar URL)
- `POST /api/users/me/avatar` - upload avatar image (multipart field: `avatar`)
- `GET /api/users` - list users (admin only)
- `POST /api/users` - create user (admin only)
- `PATCH /api/users/:userId` - update user (admin only)
- `POST /api/users/:userId/reset-password` - create reset token for a user (admin only)
- `GET /api/health` - DB connectivity
- `GET /api/months` - list all months
- `GET /api/months/:monthKey` - get a month
- `PUT /api/months/:monthKey` - create/update a month
- `DELETE /api/months/:monthKey` - delete a month

## Data formats
- `monthKey`: `YYYY-MM`
- `avatarUrl`: image URL string (or `null`)

## Notes
- Vite dev server proxies `/api` to `http://localhost:3001`.
- Password reset tokens are returned in API responses.
