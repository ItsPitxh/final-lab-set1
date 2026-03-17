# ENGSE207 Final Lab — Set 1
## Microservices + HTTPS + Lightweight Logging

| | |
|---|---|
| Course | ENGSE207 Software Architecture |
| Student | 67543210061-7 นายพิชฌ์ สินธรสวัสดิ์ |

---

## Overview

A **Task Board Microservices** system built with 6 Docker services behind an Nginx HTTPS gateway. No registration — seed users only. All inter-service logging goes through a dedicated Log Service backed by PostgreSQL.

---

## Architecture

```
Browser / Postman
       │
       │ HTTPS :443  (HTTP :80 → 301 redirect)
       ▼
┌──────────────────────────────────────────────────────────┐
│  Nginx  (API Gateway + TLS Termination + Rate Limiting)  │
│                                                          │
│  /api/auth/*  → auth-service:3001                        │
│  /api/tasks/* → task-service:3002   [JWT required]       │
│  /api/logs/*  → log-service:3003    [JWT + admin only]   │
│  /            → frontend:80                              │
└──────┬──────────────────┬──────────────────┬─────────────┘
       │                  │                  │
       ▼                  ▼                  ▼
  auth-service        task-service       log-service
     :3001               :3002              :3003
       │                  │                  │
       └──────────────────┴──────────────────┘
                          │
                     PostgreSQL
                   (shared DB :5432)
                  users / tasks / logs
```

### Services

| Service | Port | Role |
|---|---|---|
| nginx | 80, 443 | TLS termination, reverse proxy, rate limit |
| frontend | 80 (internal) | Static HTML |
| auth-service | 3001 | Login, JWT |
| task-service | 3002 | CRUD Tasks |
| log-service | 3003 | Logging API |
| postgres | 5432 | Shared database |

---

## Getting Started

### 1. Clone and set up env
```bash
git clone <repo-url>
cd final-lab-set1
cp .env.example .env
```

### 2. Generate self-signed certificate
```bash
chmod +x scripts/gen-certs.sh
./scripts/gen-certs.sh
```

### 3. Run
```bash
docker compose up --build
```

Open `https://localhost` — accept the self-signed cert warning.

### Reset database
```bash
docker compose down -v
docker compose up --build
```

---

## Seed Users

| Username | Email | Password | Role |
|---|---|---|---|
| alice | alice@lab.local | `alice123` | member |
| bob | bob@lab.local | `bob456` | member |
| admin | admin@lab.local | `adminpass` | admin |

Bcrypt hashes (rounds=10) were generated with Python and are hardcoded in `db/init.sql`:
```python
import bcrypt
print(bcrypt.hashpw(b'alice123', bcrypt.gensalt(rounds=10)).decode())
```

---

## API Testing

```bash
BASE="https://localhost"

# Login
TOKEN=$(curl -sk -X POST $BASE/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@lab.local","password":"alice123"}' | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# Create task
curl -sk -X POST $BASE/api/tasks/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test task","priority":"high"}'

# Get tasks
curl -sk $BASE/api/tasks/ -H "Authorization: Bearer $TOKEN"

# No JWT → 401
curl -sk $BASE/api/tasks/

# Member tries logs → 403
curl -sk -i $BASE/api/logs/ -H "Authorization: Bearer $TOKEN"

# Admin logs
ADMIN_TOKEN=$(curl -sk -X POST $BASE/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@lab.local","password":"adminpass"}' | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
curl -sk $BASE/api/logs/ -H "Authorization: Bearer $ADMIN_TOKEN"

# Rate limit test (> 5/min on login)
for i in {1..8}; do
  echo -n "Attempt $i: "
  curl -sk -o /dev/null -w "%{http_code}\n" -X POST $BASE/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"alice@lab.local","password":"wrong"}'
  sleep 0.1
done
```

---

## How HTTPS, JWT, and Logging Work

### HTTPS
Nginx listens on port 80 and 443. All HTTP traffic is redirected to HTTPS with a 301. TLS is terminated at Nginx using a self-signed certificate — traffic inside Docker uses plain HTTP between services.

### JWT
On login, Auth Service verifies the bcrypt password and signs a JWT with `{ sub, email, role, username }` (1h expiry). Every request to Task Service and Log Service must carry `Authorization: Bearer <token>` — the middleware calls `jwt.verify()` before processing.

### Logging
Services call `POST http://log-service:3003/api/logs/internal` (fire-and-forget) inside the Docker network. Nginx blocks this path from the outside with `location = /api/logs/internal { return 403; }`. Logs are stored in the `logs` table and readable via `GET /api/logs/` by admin only.

---

## Known Limitations

- Self-signed cert causes browser warning (expected for dev)
- JWT stored in `localStorage` — use HttpOnly cookie in production
- Single shared database — separate per service in production
- No log rotation or retention policy
