
# Momentum Quant SaaS

Quantitative trading platform for Indian equities (NSE). Live momentum scanning, custom formula scoring, backtesting, portfolio tracking, and Zerodha Kite live order execution.

## Features

- **EOD Scanner** — Score NIFTY 50/100/200/250/500 universes using a text formula. Sector filter, price filter, CSV export, quantity calculator.
- **Custom Formula Engine** — Plain-English formulas (`6 Month Performance / 6 Month Volatility`) compiled to a safe recursive-descent evaluator. 8 built-in factors.
- **Backtester** — Historical simulation with full/FRR rebalancing, regime filter (Supertrend), uncorrelated asset parking, benchmark comparison, and 13 performance metrics.
- **Optimizer** — Grid search over topN × rebalance frequency × lookback sets, ranked by Sharpe.
- **Intraday Scoring** — Short-term scoring via 1m/5m/15m Yahoo Finance bars with custom formula support.
- **Portfolio Manager** — Track holdings, view live P&L, refresh prices from Yahoo Finance. Auth-gated, scoped per user, max 5 per user.
- **Strategy Library** — Save, name, and reuse scoring formulas. Formula validated at save time.
- **Preset Strategies** — One-click load of 6 curated backtest presets.
- **Kite Live Trading** — Zerodha KiteConnect v5 integration. Dry-run and live order modes. Auth-gated.
- **SIP Calculator** — Compound growth projections with yearly SIP step-up.
- **Auth** — JWT (with `jti`) + bcrypt. Per-session DB revocation, session cap (5/user), rate-limited login/register.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js 18+, Express 4 |
| Frontend | Vite + React 18, Recharts |
| Database | SQLite via better-sqlite3 (WAL mode, FK ON) |
| Price Data | yahoo-finance2 (UA rotation, exponential backoff) |
| Live Trading | Zerodha KiteConnect v5 |
| Auth | jsonwebtoken + bcryptjs |

## Setup

### Prerequisites

- Node.js 18+
- Zerodha Kite developer account (only required for live trading)

### Install

```bash
npm install
cd frontend && npm install && cd ..
```

### Environment

Copy `.env.example` to `.env` and fill in:

```
KITE_API_KEY=           # Required for live trading
KITE_API_SECRET=        # Required for session generation
KITE_ACCESS_TOKEN=      # Required for live trading
JWT_SECRET=             # Required in prod — use a long random string
ALLOWED_ORIGINS=        # Comma-separated CORS origins (default: localhost:3000,5173)
YF_QUERY_HOST=query1.finance.yahoo.com  # Optional
PORT=3000               # Optional (default 3000)
DB_PATH=                # Optional (default data/momentum.db)
```

## Running

Two terminals needed for development:

```bash
# Terminal 1 — backend with auto-reload
npm run dev

# Terminal 2 — frontend dev server at :5173, proxies /api to :3000
npm run frontend
```

Open <http://localhost:5173> in dev mode.

### Production build

```bash
npm run frontend:build   # builds React → public/
npm start                # serves everything from Express at :3000
```

### Refresh stock universes

```bash
npm run fetch-universes   # refresh all universes
npm run fetch-nifty500    # NIFTY 500 only
```

## Security

- CORS restricted to `ALLOWED_ORIGINS` (env-configurable)
- Auth routes: 10 req / 15 min per IP
- Heavy routes (scan, score, backtest, optimize, rebalance): 30 req / 10 min per IP
- JWT uses `jti` (random UUID) to guarantee token uniqueness across rapid logins
- Sessions capped at 5 per user; oldest evicted on overflow
- 5xx responses never expose internal error details
- Portfolio routes enforce ownership — cross-user access returns 403

## API Reference

All endpoints return JSON. Authentication uses `Authorization: Bearer <token>`.

### Scanning & Scoring

```
GET  /api/scanner?universe=nifty500&limit=100&topN=20&lookbacks=21,63,126&formula=
POST /api/score          { formula, universe, limit, topN, priceMin, priceMax, page, pageSize }
POST /api/score/intraday { universe, limit, topN, interval, formula }
GET  /api/scans?universe=&limit=
GET  /api/scans/:id
GET  /api/score/:scanId/download   → CSV
```

### Backtesting & Optimization

```
POST /api/backtest  { universe, symbolLimit, topN, rebalanceFrequency, startDate, endDate,
                      initialCapital, formula, exitRank, regimeFilter, uncorrelatedAsset }
GET  /api/backtests
GET  /api/backtests/:id/download   → CSV
POST /api/optimize  { universe, symbolLimit, grid }
```

`regimeFilter` object: `{ enabled, period, multiplier, action }` — action: `half_portfolio | quarter_portfolio | exit_all`

`uncorrelatedAsset` object: `{ enabled, symbol }` — e.g. `GOLDBEES`

`exitRank` (FRR): sell a held stock only if its current rank drops below this threshold. `0` = full replacement.

### Strategies

```
GET    /api/strategies
GET    /api/strategies/:id
POST   /api/strategies    { name, formula, description }
PUT    /api/strategies/:id
DELETE /api/strategies/:id
```

### Portfolios (auth required)

```
GET    /api/portfolios
POST   /api/portfolios               { name, universe }
GET    /api/portfolios/:id
PUT    /api/portfolios/:id
DELETE /api/portfolios/:id
POST   /api/portfolios/:id/holdings  { symbol, quantity, entry_price, entry_date }
DELETE /api/portfolios/:id/holdings/:holdingId
GET    /api/portfolios/:id/performance
POST   /api/portfolios/:id/refresh   → fetches live prices, updates P&L
```

### Auth

```
POST /api/auth/register  { email, password }   → { user, token }   (rate limited)
POST /api/auth/login     { email, password }   → { user, token }   (rate limited)
GET  /api/auth/me                              → { user }
POST /api/auth/logout                          → { success: true }
```

### Kite / Zerodha

```
GET  /api/kite/login                            → { loginUrl }
POST /api/kite/session   { requestToken }       → { accessToken }
GET  /api/kite/positions
GET  /api/kite/holdings
POST /api/rebalance      { execute, dryRun, universe, capitalPerStock }   (auth required)
```

### Utilities

```
GET /api/universes   → list of available universe names
GET /api/sectors     → { SYMBOL: "Sector", ..., _sectors: [...] }
GET /api/presets     → { presets: [...] }
```

## Formula Engine

Score stocks with plain-English text formulas. Formulas are parsed at save time and evaluated per-stock at scoring time.

**14 Built-in Factors:**

| Category | Factor | Description |
|----------|--------|-------------|
| Performance | `1/3/6/9/12 Month Performance` | Price return over N×21 trading days |
| Volatility | `1/3/6/9/12 Month Volatility` | Annualized std dev of log returns over N×21 trading days |
| Price | `52 Week High Ratio` | close / 52-week high (0–1, closer to 1 = near high) |
| Price | `52 Week Low Ratio` | close / 52-week low (≥1, higher = stronger recovery) |
| Composite | `12 Minus 1 Month Performance` | 12m return minus 1m return (avoids short-term reversal) |
| Composite | `Trend Efficiency` | 12m performance / 12m volatility (risk-adjusted trend) |

**Examples:**

```
6 Month Performance / 6 Month Volatility
(60% * 6 Month Performance + 40% * 3 Month Performance) / 6 Month Volatility
12 Month Performance - 1 Month Performance
3 Month Performance / 3 Month Volatility
```

- Division by zero scores 9999 (ranks highest, treated as infinite Sharpe)
- Invalid formulas return HTTP 400 with a descriptive error message
- Intraday scoring uses its own factor set: `perf30/60/90`, `vol30/60/90`, `price`

## Backtest Metrics

| Metric | Description |
|--------|-------------|
| Total Return | `(finalValue - capital) / capital × 100` |
| CAGR | Annualized return (requires ≥ 6 months of data) |
| Sharpe Ratio | Annualized `mean(daily returns) / std(daily returns) × √252` |
| Max Drawdown | Peak-to-trough decline |
| Win Rate | % of closed trades with positive ROI |
| Avg Winners/Losers ROI | Mean ROI of winning/losing trades |
| Best/Worst Trade | Max/min single-trade ROI |
| Risk:Reward | `abs(avgWinners / avgLosers)` |
| Avg Trades/Year | Closed trades ÷ years |
| Total Trades | Count of fully closed positions |

## Database Schema

SQLite at `data/momentum.db` (WAL mode, foreign keys ON).

| Table | Purpose |
|-------|---------|
| `scan_results` | Scan run metadata |
| `scan_scores` | Per-symbol scores for a scan |
| `backtest_results` | Full backtest result JSON + summary metrics |
| `orders` | Kite rebalance orders |
| `strategies` | Named formula strategies |
| `portfolios` | User portfolios (scoped by `user_id`) |
| `portfolio_holdings` | Holdings with live price columns |
| `users` | Auth: email + bcrypt hash + plan |
| `sessions` | JWT sessions with expiry (max 5 per user) |

## Deployment

### PM2

```bash
npm install -g pm2
npm run frontend:build
pm2 start server.js --name momentum-quant
pm2 save && pm2 startup
```

### Nginx reverse proxy

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Weekly Rebalance Cron

```bash
# Runs every Monday at 9:15 AM IST
15 9 * * MON curl -s -X POST http://localhost:3000/api/rebalance \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"execute":true,"dryRun":false,"universe":"nifty500","capitalPerStock":50000}'
```

## Disclaimer

This software is for educational and research purposes only. Always paper-trade and validate strategies before using real capital. The authors are not responsible for any financial losses.


## Features

- **Live Scanner** — Scan NIFTY 50/100/200/250/500 universes using configurable momentum lookbacks
- **Custom Formula Scoring** — Text-based formula engine (`6 Month Performance / 6 Month Volatility`) with 10 built-in factors
- **Backtester** — Historical simulation with periodic rebalancing, benchmark comparison, and 11 performance metrics (CAGR, Sharpe, max drawdown, win rate, Calmar, Sortino, etc.)
- **Optimizer** — Grid search over topN, rebalance frequency, and lookback combinations, ranked by Sharpe
- **Intraday Scoring** — Short-term scoring via 5-minute Yahoo Finance bars
- **Portfolio Manager** — Track holdings, P&L, and refresh prices (auth-gated, max 5 per user)
- **Strategy Library** — Save, name, and reuse scoring formulas via CRUD API
- **Preset Strategies** — One-click load of curated formula strategies
- **Kite Live Trading** — Zerodha KiteConnect integration with dry-run and live order modes
- **Auth** — JWT-based register/login/logout with per-session DB revocation

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js 18+, Express 4 |
| Frontend | Vite + React 18 + Recharts |
| Database | SQLite (better-sqlite3, WAL mode) |
| Price Data | Yahoo Finance (yahoo-finance2) |
| Live Trading | Zerodha KiteConnect v5 |
| Auth | JWT (jsonwebtoken) + bcryptjs |

## Setup

### Prerequisites

- Node.js 18+
- A Zerodha Kite developer account (only required for live trading)

### Install

```bash
# Install backend dependencies
npm install

# Install frontend dependencies
cd frontend && npm install && cd ..
```

### Environment

```bash
cp .env.example .env
```

Edit `.env`:

```
KITE_API_KEY=           # Required for live trading
KITE_API_SECRET=        # Required for Kite session generation
KITE_ACCESS_TOKEN=      # Required for live trading
JWT_SECRET=             # Required in prod — use a long random string
ALLOWED_ORIGINS=        # Comma-separated CORS origins (optional)
YF_QUERY_HOST=query1.finance.yahoo.com  # Optional
PORT=3000               # Optional (default 3000)
DB_PATH=                # Optional (default data/momentum.db)
```

## Running

Development requires two terminals:

```bash
# Terminal 1 — backend (auto-reload)
npm run dev

# Terminal 2 — frontend dev server at :5173
npm run frontend
```

Open http://localhost:5173 (dev) or http://localhost:3000 (prod build).

### Production build

```bash
npm run frontend:build   # builds React → public/
npm start                # serves everything from Express
```

Open http://localhost:3000.

### Refresh stock universes

```bash
npm run fetch-universes   # all universes
npm run fetch-nifty500    # NIFTY 500 only
```

## API Reference

All endpoints return JSON. Heavy compute routes are rate-limited at **30 req / 10 min** per IP. Auth routes at **10 req / 15 min**.

### Scanning & Scoring

```
GET  /api/scanner?universe=nifty500&limit=100&topN=20&lookbacks=21,63,126&formula=
POST /api/score          {formula, universe, limit, topN, priceMin, priceMax, page, pageSize}
POST /api/score/intraday {universe, limit, topN, formula}
GET  /api/scans
GET  /api/scans/:id
GET  /api/score/:scanId/download        → CSV
```

### Backtesting & Optimization

```
POST /api/backtest        {universe, symbolLimit, topN, rebalanceFrequency, lookbacks, formula}
GET  /api/backtests
GET  /api/backtests/:id/download        → CSV
POST /api/optimize        {universe, symbolLimit, grid}
```

### Strategies

```
GET    /api/strategies
GET    /api/strategies/:id
POST   /api/strategies    {name, formula, description}
PUT    /api/strategies/:id
DELETE /api/strategies/:id
```

### Portfolios (auth required)

```
GET    /api/portfolios
POST   /api/portfolios               {name, universe, strategy_id}
GET    /api/portfolios/:id
PUT    /api/portfolios/:id
DELETE /api/portfolios/:id
POST   /api/portfolios/:id/holdings  {symbol, quantity, entry_price}
DELETE /api/portfolios/:id/holdings/:holdingId
GET    /api/portfolios/:id/performance
POST   /api/portfolios/:id/refresh
```

### Auth

```
POST /api/auth/register  {email, password}    → {user, token}
POST /api/auth/login     {email, password}    → {user, token}
GET  /api/auth/me                             → {user}   (requires Bearer token)
POST /api/auth/logout                         (requires Bearer token)
```

Pass the token as `Authorization: Bearer <token>`.

### Kite / Zerodha

```
GET  /api/kite/login                          → {loginUrl}
POST /api/kite/session  {requestToken}        → {accessToken}
GET  /api/kite/positions
GET  /api/kite/holdings
POST /api/rebalance     {execute, dryRun, universe, capitalPerStock}   (auth required)
```

### Utilities

```
GET /api/universes     → list of universe names
GET /api/sectors       → symbol → sector map
GET /api/presets       → preset strategy definitions
```

## Formula Engine

Score stocks with plain English formulas using 10 built-in factors:

**Factors:** `1/3/6/9/12 Month Performance`, `1/3/6/9/12 Month Volatility`

**Examples:**
```
6 Month Performance / 6 Month Volatility
(60% * 6 Month Performance + 40% * 3 Month Performance) / 6 Month Volatility
12 Month Performance - 1 Month Performance
```

Invalid formulas return HTTP 400 with a descriptive error.

## Deployment

### PM2

```bash
npm install -g pm2
npm run frontend:build
pm2 start server.js --name momentum-quant
pm2 save
pm2 startup
```

### Nginx (reverse proxy)

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Weekly Rebalance Cron

```bash
# Runs every Monday at 9:15 AM IST
15 9 * * MON curl -X POST http://localhost:3000/api/rebalance \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"execute":true,"dryRun":false,"universe":"nifty500","capitalPerStock":50000}'
```

## Disclaimer

This software is for educational purposes only. Always paper-trade and validate strategies before using real capital. The authors are not responsible for financial losses.
