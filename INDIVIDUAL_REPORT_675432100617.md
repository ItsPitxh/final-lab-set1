# INDIVIDUAL_REPORT_675432100617.md

## 1. Student Info

| | |
|---|---|
| Name | นายพิชฌ์ สินธรสวัสดิ์ |
| Student ID | 67543210061-7 |
| Course | ENGSE207 Software Architecture |
| Assignment | Final Lab Set 1 — Microservices + HTTPS + Lightweight Logging |

---

## 2. Responsibilities

Solo project — responsible for all parts of the system.

---

## 3. What I Built

**Nginx HTTPS Setup**
Configured `ssl_certificate` and `ssl_certificate_key` in `nginx.conf`, set `ssl_protocols TLSv1.2 TLSv1.3`, added security headers (HSTS, X-Frame-Options, X-Content-Type-Options), and set up HTTP → HTTPS redirect.

**Rate Limiting**
Used `limit_req_zone` to create two zones: `login_limit` (5r/m) for the login endpoint and `api_limit` (30r/m) for general API routes.

**Auth Service**
Built login flow with `bcrypt.compare()` for password verification. Used a DUMMY_BCRYPT_HASH when the user is not found to prevent timing attacks. JWT is signed with `{ sub, email, role, username }` payload and verified with `jwt.verify()`.

**Task Service**
Built CRUD routes with `requireAuth` middleware. Admin users can see all tasks; members see only their own. `logEvent()` helper sends fire-and-forget POST requests to the Log Service.

**Log Service**
Built `POST /api/logs/internal` for receiving logs from other services (no JWT, internal only — Nginx blocks it from outside). `GET /api/logs/` and `/api/logs/stats` are admin-only via `verifyAdminJWT` middleware.

**Frontend**
`index.html` — login form, task board with filter/CRUD, JWT inspector in profile page.
`logs.html` — auto-refreshing log table with level/service filters, stats cards, admin-only access.

---

## 4. Problems and Solutions

**Problem 1: bcrypt hashes**
npm registry was blocked by a security policy — couldn't install `bcryptjs` to generate hashes. Solved by using Python's `bcrypt` library instead and hardcoding the hashes directly in `init.sql`.

**Problem 2: Service startup race condition**
Services tried to connect to PostgreSQL before it was ready. Solved by adding a retry loop (10 retries, 3s delay) in the `start()` function of each service.

**Problem 3: `/api/logs/stats` being intercepted by `/api/logs/`**
Express matches routes in order — putting `GET /api/logs/` before `GET /api/logs/stats` would intercept the stats route. Solved by registering `/stats` before `/`.

**Problem 4: Nginx exact match for internal route**
Using `location /api/logs/internal` (prefix match) would override `location /api/logs/`. Solved with `location = /api/logs/internal { return 403; }` (exact match).

---

## 5. What I Learned

- **TLS Termination at Nginx**: Traffic between Nginx and backend services is plain HTTP inside Docker — acceptable for internal networks but mTLS would be better in production.
- **JWT Security**: Storing `JWT_SECRET` in environment variables and never hardcoding it in source code is critical. Token expiry and proper error handling matter too.
- **Microservice Communication**: Services should communicate using Docker DNS service names, not IP addresses.
- **Lightweight vs Full Logging**: REST-based logging to a DB is simple and sufficient for a lab, but production systems need aggregation, alerting, and retention policies (ELK, Loki, etc.).
- **Rate Limiting at the Gateway**: Handling rate limiting in Nginx keeps application code clean and provides a single enforcement point.

---

## 6. What I'd Improve in Set 2

- Replace self-signed cert with Let's Encrypt
- Move JWT storage from `localStorage` to HttpOnly cookies
- Separate database per service
- Add JWT refresh token flow
- Add proper input validation middleware
- Add log retention and pagination
