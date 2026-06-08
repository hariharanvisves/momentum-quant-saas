# Architecture

## Overview

Momentum Quant SaaS is a full-stack quantitative trading platform for Indian equities (NSE/BSE via Yahoo Finance). It provides live scanning, custom formula scoring, backtesting, portfolio tracking, and Zerodha Kite live trading.

```
┌─────────────────────────────────────────────────────┐
│                   Browser (React 18)                │
│  Vite dev :5173  ──proxy /api──►  Express :3000     │
│  or served from public/ (Express static)            │
└────────────────────┬────────────────────────────────┘
                     │ HTTP / REST
┌────────────────────▼────────────────────────────────┐
│               Express (server.js :3000)             │
│  CORS · JSON · static · rate limiter · requireAuth  │
├─────────────────────────────────────────────────────┤
│  Route handlers  →  Service layer  →  db.js (SQLite)│
└─────────────────────────────────────────────────────┘
                     │
          ┌──────────┼──────────────┐
          ▼          ▼              ▼
    Yahoo Finance  Kite Connect   SQLite WAL
    (yahoo-finance2) (kiteconnect) (better-sqlite3)
```

## Layers

### Frontend (`frontend/`)
- Vite + React 18 + Recharts
- `AuthContext` manages JWT, login/logout state
- API calls via `src/api.js` (attaches `Authorization: Bearer <token>`)
- Build output → `public/` (served by Express as static files)

### Backend (`server.js`)
- Express 4 with CORS, JSON body parsing
- Two rate-limiting tiers (in-memory, per-IP):
  - Auth: 10 req / 15 min
  - Heavy compute: 30 req / 10 min
- `requireAuth` middleware validates JWT and attaches `req.user`
- Error handler: leaks no internal details; returns `503 Service unavailable`

### Service Layer (`services/`)

| Service | Responsibility |
|---|---|
| `yahoo.js` | Yahoo Finance fetch, UA rotation, 429 backoff (5-20s), 4 retries |
| `scanner.js` | Legacy momentum scan: ROC at configurable lookbacks − annualized vol |
| `scoring.js` | Formula-driven scoring: fetch → `factors.computeAll` → `formula.parse` → rank → persist |
| `factors.js` | Pure factor functions: performance & volatility at 1/3/6/9/12 month windows |
| `formula.js` | Recursive-descent parser/evaluator for text scoring formulas |
| `indicators.js` | Technical indicators (Supertrend, etc.) used by backtest |
| `intraday.js` | Intraday scoring via 5-minute bars |
| `backtest.js` | Full historical backtest with periodic rebalancing, benchmark, 12 metrics |
| `optimizer.js` | Grid search over backtest params; ranked by Sharpe |
| `portfolio.js` | Portfolio CRUD + real-time P&L via Yahoo Finance price refresh |
| `auth.js` | JWT register/login/logout, bcryptjs hashing, max 5 sessions/user (evicts oldest); exports `register`, `login`, `verifyToken`, `getUser`, `invalidateSession` |
| `kite.js` | Zerodha KiteConnect wrapper: auth, position sizing, dry-run orders |

### Persistence (`db.js`)

SQLite at `data/momentum.db`, WAL mode, foreign keys ON.

```
scan_results        scan run metadata (universe, timestamp, config)
scan_scores         per-symbol rank, score, momentum, volatility
backtest_results    run metadata + full result JSON (equity curve etc.)
orders              Kite rebalance orders with status tracking
strategies          named formula strategies (name, formula, description)
portfolios          user portfolios (user_id scoped)
portfolio_holdings  individual holdings with P&L fields
users               email + bcrypt hash + plan tier
sessions            JWT tokens with expiry (max 5 per user)
```

Migration: `portfolios.user_id` added via `ALTER TABLE` on startup (idempotent).

## Data Flow — Formula Scoring

```
POST /api/score
  └─► scoring.score(opts)
        ├─ loadUniverse(name)           ← data/universes/*.json
        ├─ fetchChart(symbol)           ← Yahoo Finance (yahoo.js)
        ├─ computeAll(closes)           ← factors.js
        │    └─ { "6 month performance": x, "6 month volatility": y, ... }
        ├─ parse(formulaText)(factorValues)  ← formula.js
        └─ rank → paginate → persist → return
```

## Data Flow — Backtest

```
POST /api/backtest
  └─► backtest.run(params)
        ├─ fetch daily closes for all universe symbols ← yahoo.js
        ├─ for each rebalance date:
        │    └─ scoreStock(closes, formula, lookbacks)  ← factors.js + formula.js
        │         or calcMomentum(closes, lookbacks)    ← scanner.js (legacy)
        ├─ simulate portfolio with equal-weight topN stocks
        ├─ benchmark: NIFTY 50 (^NSEI)
        ├─ computeMetrics(trades, equityCurve, capital)
        │    → totalReturn, CAGR, Sharpe, maxDrawdown, winRate, avgWinners/LosersROI,
        │       biggestWinner/LoserROI, riskToReward, avgTradesPerYear, totalTrades
        └─ persist to backtest_results → return
```

## Auth Flow

```
POST /api/auth/register  →  bcrypt hash  →  INSERT users  →  JWT + session
POST /api/auth/login     →  bcrypt verify  →  JWT + session (max 5, evict oldest)
requireAuth middleware   →  verify JWT  →  validate session in DB  →  req.user
POST /api/auth/logout    →  DELETE session row
```

## Formula Engine (`services/formula.js`)

Recursive-descent parser; no `eval` or `new Function`.

Supported syntax:
- Factor names: `6 Month Performance`, `3 Month Volatility`, etc.
- Arithmetic: `+`, `-`, `*`, `/`, parentheses
- Percentage weights: `60% * 6 Month Performance`

Examples:
```
6 Month Performance / 6 Month Volatility
(60% * 6 Month Performance + 40% * 3 Month Performance) / 6 Month Volatility
```

Throws `FormulaError` for unknown factors or parse errors; caught by Express error handler and returned as HTTP 400.

## Factor Registry (`services/factors.js`)

Each factor maps a human-readable name to a pure function `(closes: number[]) → number`. Returns 0 on insufficient data.

| Factor | Description |
|---|---|
| `1 month performance` | ROC over 21 trading days |
| `3 month performance` | ROC over 63 trading days |
| `6 month performance` | ROC over 126 trading days |
| `9 month performance` | ROC over 189 trading days |
| `12 month performance` | ROC over 252 trading days |
| `1 month volatility` | Annualized std-dev of log returns over 21 days |
| `3 month volatility` | Annualized std-dev of log returns over 63 days |
| `6 month volatility` | Annualized std-dev of log returns over 126 days |
| `9 month volatility` | Annualized std-dev of log returns over 189 days |
| `12 month volatility` | Annualized std-dev of log returns over 252 days |
| `52 week high ratio` | close / 52-week high (0–1, closer to 1 = near high) |
| `52 week low ratio` | close / 52-week low (≥1, higher = stronger recovery) |
| `12 minus 1 month performance` | 12m return minus 1m return (avoids short-term reversal) |
| `trend efficiency` | 12m performance / 12m volatility (risk-adjusted trend) |

## Stock Universes

JSON arrays in `data/universes/` (symbols without `.NS` suffix):

| File | Index |
|---|---|
| `nifty50.json` | NIFTY 50 |
| `nifty100.json` | NIFTY 100 |
| `nifty200.json` | NIFTY 200 |
| `nifty250.json` | NIFTY 250 |
| `nifty500.json` | NIFTY 500 |

Refreshed via `npm run fetch-universes` (`scripts/fetch-universes.js`).

## Key Dependencies

| Package | Version | Purpose |
|---|---|---|
| `express` | ^4.18 | HTTP server |
| `better-sqlite3` | ^12.10 | SQLite (sync API, WAL mode) |
| `yahoo-finance2` | 2.12.0 | Price data (pinned to avoid breaking changes) |
| `kiteconnect` | ^5.3 | Zerodha trading API |
| `jsonwebtoken` | ^9.0 | JWT signing/verification |
| `bcryptjs` | ^3.0 | Password hashing |
| `dotenv` | ^16.4 | Env var loading |
