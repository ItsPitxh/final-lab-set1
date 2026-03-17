# TEAM_SPLIT.md

## Team Members

| Student ID | Name |
|---|---|
| 67543210061-7 | นายพิชฌ์ สินธรสวัสดิ์ |

> Solo project — all work done by one student.

---

## Work Allocation

### นายพิชฌ์ สินธรสวัสดิ์ — All sections

**Infrastructure**
- Nginx HTTPS config, rate limiting, reverse proxy
- Self-signed certificate setup
- Docker Compose configuration

**Auth Service**
- Login with bcrypt password verification
- Timing-safe dummy hash for missing users
- JWT generation and verification
- `/login`, `/verify`, `/me`, `/health` endpoints

**Task Service**
- Full CRUD for tasks
- JWT middleware
- Role-based access (admin sees all, member sees own)
- Log events on create/update/delete

**Log Service**
- Internal endpoint for receiving logs from other services
- Admin-only `GET /api/logs/` and `/api/logs/stats`

**Database**
- Schema design for users, tasks, logs
- bcrypt hash generation for seed users
- Indexes for log query performance

**Frontend**
- Task Board UI (`index.html`)
- Log Dashboard (`logs.html`) — admin only, auto-refresh

---

## Integration Notes

- Auth Service issues JWTs that Task Service and Log Service both verify using the same `JWT_SECRET`
- Task Service and Auth Service send logs to Log Service via `http://log-service:3003/api/logs/internal` — only reachable inside Docker network
- Nginx is the single entry point — no service exposes ports directly
- Frontend uses relative URLs so Nginx handles all routing
