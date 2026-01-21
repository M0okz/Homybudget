# HomyBudget 💰

**HomyBudget** is a modern web app for personal or shared budgeting. Track income, fixed costs, and flexible expenses with a clean, responsive interface.

## Table of Contents
- Features
- Requirements
- Quick Start
  - Option 1: Docker Compose (recommended)
  - Option 2: Docker with external database
- Configuration
- Volumes
- Operations
- Architecture
- Security Notes
- Troubleshooting
- License

## Features
- 📊 Monthly budget dashboards
- 💳 Fixed and flexible expense tracking
- 👥 Shared budgets for couples
- 🎨 Theme, language, and sorting preferences
- 🔒 JWT authentication and user roles
- 📱 Responsive UI
- 🖼️ User profile images

## Requirements
- Docker and Docker Compose
- PostgreSQL 16+ (included in Compose)

## Quick Start

### Option 1: Docker Compose (recommended)

1) Create a `docker-compose.yml`:

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: homybudget
      POSTGRES_PASSWORD: homybudget
      POSTGRES_DB: homybudget
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U homybudget -d homybudget"]
      interval: 5s
      timeout: 5s
      retries: 5

  app:
    image: homynudget/homybudget:latest
    environment:
      PORT: 3001
      CORS_ORIGIN: http://localhost:8080
      JWT_SECRET: change_me_very_long_secret_key
      PASSWORD_MIN_LENGTH: 8
      PASSWORD_RESET_TOKEN_TTL_MINUTES: 60
      PGHOST: db
      PGPORT: 5432
      PGUSER: homybudget
      PGPASSWORD: homybudget
      PGDATABASE: homybudget
    depends_on:
      db:
        condition: service_healthy
    volumes:
      - uploads-data:/app/server/uploads
    ports:
      - "8080:80"

volumes:
  db-data:
  uploads-data:
```

2) Start the stack:

```bash
docker compose up -d
```

3) Open the app:

```
http://localhost:8080
```

4) Complete the first-run wizard to create your admin user.

Note: the database schema is initialized automatically by the app on first start.

### Option 2: Docker with external database

```bash
docker run -d \
  --name homybudget \
  -p 8080:80 \
  -e PORT=3001 \
  -e CORS_ORIGIN=http://localhost:8080 \
  -e JWT_SECRET=YourVerySecretJWTKey \
  -e PASSWORD_MIN_LENGTH=8 \
  -e PASSWORD_RESET_TOKEN_TTL_MINUTES=60 \
  -e PGHOST=your_db_host \
  -e PGPORT=5432 \
  -e PGUSER=your_db_user \
  -e PGPASSWORD=your_db_password \
  -e PGDATABASE=your_db_name \
  -v homybudget-uploads:/app/server/uploads \
  homynudget/homybudget:latest
```

## Configuration

### Environment Variables

| Variable | Description | Default | Required |
|---|---|---|---|
| `PORT` | Internal API port | `3001` | No |
| `CORS_ORIGIN` | Allowed CORS origin | `http://localhost:8080` | Yes |
| `JWT_SECRET` | JWT signing key | - | Yes |
| `PASSWORD_MIN_LENGTH` | Minimum password length | `8` | No |
| `PASSWORD_RESET_TOKEN_TTL_MINUTES` | Reset token TTL | `60` | No |
| `PGHOST` | PostgreSQL host | `localhost` | Yes |
| `PGPORT` | PostgreSQL port | `5432` | No |
| `PGUSER` | PostgreSQL user | - | Yes |
| `PGPASSWORD` | PostgreSQL password | - | Yes |
| `PGDATABASE` | PostgreSQL database name | - | Yes |

## Volumes

| Volume | Description |
|---|---|
| `/app/server/uploads` | Profile images and user uploads |
| `/var/lib/postgresql/data` | PostgreSQL data (if using Compose) |

## Operations

### Stop
```bash
docker compose down
```

### Logs
```bash
docker compose logs -f app
```

### Update
```bash
docker compose pull
docker compose up -d
```

### Backup
```bash
# Database
docker compose exec db pg_dump -U homybudget homybudget > backup.sql

# Uploads
docker cp homybudget-app-1:/app/server/uploads ./uploads_backup
```

### Restore
```bash
docker compose exec -T db psql -U homybudget homybudget < backup.sql
```

## Architecture
- Frontend: served by Nginx (internal port 80)
- Backend: Node.js API (internal port 3001)
- Database: PostgreSQL 16
- Auth: JWT
- Storage: Docker volumes

## Security Notes
- Change default passwords immediately.
- Use a strong `JWT_SECRET` (32+ chars).
- Add HTTPS via a reverse proxy (nginx, traefik, etc.).
- Restrict DB access to the container network.
- Schedule regular backups.

## Troubleshooting

### App doesn’t start
```bash
docker compose logs app
```

### Database not ready
```bash
docker compose logs db
```

### Can’t log in
- Check `ADMIN_USERNAME` and `ADMIN_PASSWORD`.
- Review app logs for authentication errors.

## License
` GPL-3.0 license`.

---

Made with ❤️ for better personal finance management
