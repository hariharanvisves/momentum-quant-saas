# ADR-001: Architecture Improvements Backlog

**Status:** Proposed  
**Date:** 2026-06-07  
**Source:** Architecture review of momentum-quant-saas

---

## Context

Single-process Express + SQLite app. Works well for personal use. These improvements needed before scaling to multi-user SaaS or handling concurrent heavy operations.

---

## P0 — Critical (do first)

### 1. Price data cache (SQLite)
**Problem:** Every backtest/scan fetches fresh prices from Yahoo Finance. 50-stock universe = 50 × 4s = 200s of pure I/O before any computation.

**Fix:** Add `price_cache` table to `db.js`:
```sql
CREATE TABLE IF NOT EXISTS price_cache (
  symbol TEXT NOT NULL,
  date TEXT NOT NULL,
  open REAL, high REAL, low REAL, close REAL, volume INTEGER,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (symbol, date)
);
```

Modify `services/yahoo.js` → `fetchChart()` to:
1. Check cache for symbol: if rows exist AND `MAX(fetched_at) > NOW - 1day`, return cached data
2. Otherwise fetch from Yahoo, upsert into `price_cache`

**Impact:** 10× speed improvement on repeated backtests/scans.

- [ ] Add `price_cache` table to `db.js`
- [ ] Add `getCachedPrices(symbol)` and `savePrices(symbol, quotes)` helpers in `services/yahoo.js`
- [ ] Modify `fetchChart()` to check cache first
- [ ] Add `DELETE FROM price_cache WHERE fetched_at < datetime('now', '-7 days')` cleanup on startup
- [ ] Test: run backtest twice, second run should be instant

---

### 2. Async job queue for backtest/optimize
**Problem:** `POST /api/backtest` on nifty500 = ~33 min. Blocks the entire Node process. All other users get 503 during that time.

**Fix:** Use Node.js worker threads. Return `{ jobId }` immediately, poll for result.

Files to create/modify:
- Create `services/jobQueue.js` — in-memory job registry (Map) with worker thread spawner
- Create `workers/backtest.worker.js` — worker thread that runs `backtest.run()`
- Create `workers/optimizer.worker.js` — worker thread that runs `optimizer.run()`
- Modify `server.js`:
  - `POST /api/backtest` → enqueue job, return `{ jobId, status: "queued" }`
  - `POST /api/optimize` → enqueue job, return `{ jobId, status: "queued" }`
  - Add `GET /api/jobs/:id` → return `{ status, result, error, progress }`

**Impact:** Server stays responsive during long operations. Users see progress.

- [ ] Create `services/jobQueue.js` with `enqueue(type, params)` → jobId and `getJob(id)` → `{ status, result, error }`
- [ ] Create `workers/backtest.worker.js` using `require('worker_threads')` + `workerData`
- [ ] Create `workers/optimizer.worker.js`
- [ ] Modify `POST /api/backtest` to use job queue, return `{ jobId }`
- [ ] Modify `POST /api/optimize` to use job queue, return `{ jobId }`
- [ ] Add `GET /api/jobs/:id` endpoint
- [ ] Update `BacktestPanel.jsx` to poll `GET /api/jobs/:id` every 5s until complete
- [ ] Update `OptimizerPanel.jsx` similarly

---

## P1 — Important

### 3. Structured logging with pino
**Problem:** All logs go to `console.log/error`. Zero queryable output. Can't trace a failed backtest.

**Fix:**
```bash
npm install pino pino-pretty
```

```js
// logger.js (new file)
const pino = require("pino")
module.exports = pino({ level: process.env.LOG_LEVEL || "info" })
```

Replace `console.error(err)` and `console.warn(...)` throughout with `logger.error({ err }, "message")`.

- [ ] Add `pino` and `pino-pretty` to `package.json`
- [ ] Create `logger.js` at project root
- [ ] Replace `console.error` in `server.js` global error handler
- [ ] Replace `console.warn` in `services/yahoo.js` (rate limit warnings)
- [ ] Replace `console.warn` in `services/backtest.js`, `services/scoring.js`
- [ ] Add request logging middleware (method, path, status, duration)
- [ ] Update dev script: `node server.js | pino-pretty`

---

### 4. Scope strategies by user (or document as global)
**Problem:** `GET/POST/PUT/DELETE /api/strategies` has no auth. Any user can modify any strategy. Either intentional (shared library) or a data integrity bug.

**Decision:** Pick one:

**Option A — Shared global library (current, document it):**
Add comment in `server.js` above strategy routes:
```js
// Strategies are a shared global library — any authenticated user can read/write.
// This is intentional: momentum formulas are non-sensitive shared knowledge.
```
Add `requireAuth` to `POST/PUT/DELETE` at minimum.

**Option B — User-scoped strategies:**
- Add `user_id` column to `strategies` table
- Filter `GET /api/strategies` by `req.user.id`
- Scope `PUT/DELETE` to owner only

- [ ] Decide: global library vs. user-scoped
- [ ] If global: add `requireAuth` to `POST/PUT/DELETE /api/strategies`
- [ ] If user-scoped: add migration to add `user_id` to `strategies` table + update all queries

---

### 5. SSE progress stream for backtest
**Problem:** Users see a spinner with no feedback for 10-30 min backtests. Requires polling `GET /api/jobs/:id`.

**Fix:** Add Server-Sent Events endpoint:
```js
app.get("/api/jobs/:id/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache")
  // Worker thread emits progress events → forward to SSE stream
})
```

**Depends on:** Task 2 (job queue) must be done first.

- [ ] Add `progress` callback to worker thread communication
- [ ] Add `GET /api/jobs/:id/stream` SSE endpoint
- [ ] Update `BacktestPanel.jsx` to use `EventSource` instead of polling
- [ ] Show progress bar with "Fetched 23/50 symbols..." message

---

## P2 — Nice to Have

### 6. SQLite-backed rate limiter
**Problem:** `makeRateLimiter()` in `server.js` is in-memory. Resets on restart. Can't span multiple processes.

**Fix:**
```bash
npm install rate-limiter-flexible
```

```js
const { RateLimiterSQLite } = require("rate-limiter-flexible")
const heavyRateLimit = new RateLimiterSQLite({
  storeClient: db, points: 30, duration: 600, tableName: "rate_limits"
})
```

- [ ] Install `rate-limiter-flexible`
- [ ] Replace `makeRateLimiter()` in `server.js` with `RateLimiterSQLite`
- [ ] Add `rate_limits` table to `db.js`
- [ ] Test: rate limit survives server restart

---

### 7. Email service for password reset
**Problem:** `forgotPassword()` returns the reset token in the API response (dev mode). In production this is a security issue — tokens should only be sent via email.

**Fix:** Integrate `nodemailer` with SMTP or a transactional email provider (Resend, SendGrid).

```bash
npm install nodemailer
```

Add to `.env.example`:
```
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
FROM_EMAIL=noreply@yourapp.com
```

Create `services/email.js`:
```js
const nodemailer = require("nodemailer")
async function sendPasswordReset(email, token, resetUrl) { ... }
module.exports = { sendPasswordReset }
```

- [ ] Install `nodemailer`
- [ ] Add SMTP env vars to `.env.example`
- [ ] Create `services/email.js` with `sendPasswordReset(email, token)`
- [ ] Update `services/auth.js` → `forgotPassword()` to call `email.sendPasswordReset()`
- [ ] Remove `token` from `forgotPassword()` API response in production (`NODE_ENV === "production"`)
- [ ] Add `ForgotPasswordPage.jsx` to not display token (already done — just remove from UI if shown)

---

### 8. Dividend/split adjustment in backtest
**Problem:** `services/backtest.js` uses raw OHLCV close prices. Yahoo Finance returns adjusted prices by default via `yahoo-finance2`, but this should be verified. Splits/dividends not modeled as cash events.

**Fix:**
- Verify `yahoo-finance2` returns `adjClose` in chart response
- Modify `backtest.js` to use `adjClose` instead of `close` for return calculations
- Log if `adjClose` differs significantly from `close` (signal of split/dividend)

- [ ] Check if `yahooFinance.chart()` returns `adjclose` field in quotes
- [ ] Update `services/backtest.js` to use `q.adjclose ?? q.close` throughout
- [ ] Update `services/scoring.js` similarly
- [ ] Add comment explaining why adjusted prices matter for accurate CAGR

---

## P3 — Scale Later (only if going multi-tenant SaaS)

### 9. Migrate SQLite → PostgreSQL
**When:** > 10 concurrent users, or horizontal scaling needed.

**Steps:**
- [ ] Add `pg` and `knex` (or `drizzle`) to `package.json`
- [ ] Write migration scripts for all 9 tables
- [ ] Update `db.js` to use Postgres connection pool
- [ ] Replace SQLite-specific syntax (`datetime('now')`, `AUTOINCREMENT`) with Postgres equivalents
- [ ] Update `Dockerfile` (create one first) to include Postgres connection env vars
- [ ] Test all 38 endpoints against Postgres

---

### 10. Containerize with Docker
**When:** Deploying to cloud (Fly.io, Railway, Render, AWS).

- [ ] Create `Dockerfile` (Node 20 LTS, non-root user)
- [ ] Create `docker-compose.yml` (app + optional Postgres)
- [ ] Add `.dockerignore`
- [ ] Add `HEALTHCHECK` pointing to `/health`
- [ ] Document deploy steps in `README.md`

---

## Summary Table

| # | Item | Priority | Effort | Impact |
|---|---|---|---|---|
| 1 | Price cache (SQLite) | P0 | 4h | 10× faster repeated ops |
| 2 | Async job queue (worker threads) | P0 | 8h | Unblock server under load |
| 3 | Structured logging (pino) | P1 | 2h | Observability |
| 4 | Strategy auth scoping | P1 | 2h | Data integrity |
| 5 | SSE progress stream | P1 | 4h | Better UX |
| 6 | SQLite-backed rate limiter | P2 | 1h | Persist across restarts |
| 7 | Email service (nodemailer) | P2 | 3h | Production-ready password reset |
| 8 | Adjusted close prices in backtest | P2 | 2h | Accurate return calculations |
| 9 | Migrate to PostgreSQL | P3 | 2d | Multi-tenant scale |
| 10 | Docker containerization | P3 | 4h | Cloud deployment |
