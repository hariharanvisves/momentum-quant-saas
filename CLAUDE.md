# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Backend
npm start              # Run Express server (PORT env or 3000)
npm run dev            # Run with nodemon (auto-reload)

# Frontend (Vite + React)
npm run frontend       # Dev server at :5173, proxies /api to :3000
npm run frontend:build # Build React app into public/

# Data
npm run fetch-universes  # Refresh all stock universe JSON files
npm run fetch-nifty500   # Refresh only NIFTY 500 universe
```

Development requires two terminals: `npm run dev` + `npm run frontend`.

No test runner or linter configured.

## Environment

Copy `.env.example` to `.env`:
```
KITE_API_KEY=           # Required for live trading
KITE_API_SECRET=        # Required for Kite session generation
KITE_ACCESS_TOKEN=      # Required for live trading
JWT_SECRET=             # Required in prod (auth token signing)
ALLOWED_ORIGINS=        # Comma-separated CORS origins (optional)
YF_QUERY_HOST=query1.finance.yahoo.com  # Optional
PORT=3000               # Optional
DB_PATH=                # Optional, defaults to data/momentum.db
```

## Architecture

Express backend (`server.js`) + Vite/React frontend (`frontend/`). SQLite persistence via `db.js` (better-sqlite3, WAL mode). Auth via JWT + session table. See `docs/architecture.md` for the full diagram.

### API Endpoints

#### Public / Rate-limited
| Endpoint | Notes |
|---|---|
| `GET /health` | Health check |
| `GET /api/scanner?universe=&limit=&topN=&lookbacks=&formula=` | Momentum scan, persists to DB. Heavy rate limit. |
| `POST /api/score` `{formula,universe,limit,topN,priceMin,priceMax,page,pageSize}` | Custom formula scoring. Heavy rate limit. |
| `POST /api/backtest` `{universe,symbolLimit,topN,rebalanceFrequency,lookbacks,formula}` | Backtest with equity curve + 12 metrics. Heavy rate limit. |
| `GET /api/backtests` | Last 20 backtest results |
| `GET /api/backtests/:id` | Single backtest result |
| `GET /api/backtests/:id/download` | CSV export of equity curve |
| `POST /api/optimize` `{universe,symbolLimit,grid}` | Grid search, ranked by Sharpe. Heavy rate limit. |
| `GET /api/scans?universe=&limit=` | Scan history |
| `GET /api/scans/:id` | Single scan with scores |
| `GET /api/score/:scanId/download` | CSV export of scan scores |
| `GET /api/universes` | List available universe names |
| `GET /api/sectors` | Sector map from `data/sectors.json` |
| `GET /api/presets` | Preset strategies from `data/presets.json` |
| `GET /api/factors` | List all 14 built-in factor names |
| `POST /api/score/intraday` | Intraday scoring (5-min bars) |

#### Kite / Zerodha
| Endpoint | Notes |
|---|---|
| `GET /api/kite/login` | Returns Zerodha OAuth URL |
| `POST /api/kite/session` `{requestToken}` | Exchange token for access token |
| `GET /api/kite/positions` | Live positions |
| `GET /api/kite/holdings` | Live holdings |
| `POST /api/rebalance` `{execute,dryRun,universe,capitalPerStock}` | Requires auth. Scan + optionally place orders. |

#### Strategies (CRUD, public)
| Endpoint | Notes |
|---|---|
| `GET /api/strategies` | List all strategies |
| `GET /api/strategies/:id` | Single strategy |
| `POST /api/strategies` `{name,formula,description}` | Create; validates formula at save time |
| `PUT /api/strategies/:id` | Update |
| `DELETE /api/strategies/:id` | Delete |

#### Portfolios (requires auth)
| Endpoint | Notes |
|---|---|
| `GET /api/portfolios` | List user's portfolios |
| `GET /api/portfolios/:id` | Portfolio detail |
| `POST /api/portfolios` | Create portfolio |
| `PUT /api/portfolios/:id` | Update portfolio |
| `DELETE /api/portfolios/:id` | Delete portfolio |
| `POST /api/portfolios/:id/holdings` | Add holding |
| `DELETE /api/portfolios/:id/holdings/:holdingId` | Remove holding |
| `GET /api/portfolios/:id/performance` | P&L summary |
| `POST /api/portfolios/:id/refresh` | Refresh prices via Yahoo Finance |

#### Auth
| Endpoint | Notes |
|---|---|
| `POST /api/auth/register` `{email,password}` | Register; rate limited (10/15 min) |
| `POST /api/auth/login` `{email,password}` | Login; returns JWT |
| `GET /api/auth/me` | Current user (requires auth) |
| `POST /api/auth/logout` | Invalidate session token (requires auth) |
| `PUT /api/auth/password` `{currentPassword,newPassword}` | Change password (requires auth) |
| `POST /api/auth/forgot-password` `{email}` | Send reset link; rate limited |
| `POST /api/auth/reset-password` `{token,newPassword}` | Complete password reset; rate limited |

### Service Modules

- **`services/yahoo.js`** — Yahoo Finance fetch with UA rotation, 4s delay, 5-20s backoff on 429, 4 retries. Exports `fetchChart`, `delay`, `isSkippable`.
- **`services/scanner.js`** — Legacy momentum scan: ROC at configurable lookbacks (default 21/63/126/189) minus annualized volatility. Exports `calcMomentum`, `calcVolatility`, `loadUniverse`.
- **`services/scoring.js`** — Formula-driven scoring engine: loads universe, fetches prices, calls `factors.computeAll`, evaluates formula, paginates, persists to `scan_results`/`scan_scores`.
- **`services/factors.js`** — Pure factor functions over `closes[]`: 14 factors (performance/volatility at 1/3/6/9/12 months, 52-week high/low ratios, 12-minus-1 month, trend efficiency). Returns 0 on insufficient data. Exports `computeAll`, `FACTOR_REGISTRY`, `getFactorNames`.
- **`services/formula.js`** — Recursive-descent text formula parser/evaluator. Supports `+`, `-`, `*`, `/`, parentheses, percentage weights. Throws `FormulaError` on invalid input. Exports `parse`, `FormulaError`.
- **`services/indicators.js`** — Technical indicators (e.g. `calcSupertrend`). Used by backtest engine.
- **`services/intraday.js`** — Intraday scoring using 5-minute Yahoo Finance bars. Scores stocks on short-term momentum/volatility. Exports `score`.
- **`services/backtest.js`** — Full historical backtest: periodic rebalancing, benchmark (NIFTY 50), 12 metrics (totalReturn, CAGR, Sharpe, maxDrawdown, winRate, avgWinners/LosersROI, biggestWinner/LoserROI, riskToReward, avgTradesPerYear, totalTrades), formula support. Exports `run`, `computeMetrics`, `scoreStock`.
- **`services/optimizer.js`** — Grid search over topN, rebalance frequency, lookback sets. Ranks by Sharpe. Exports `run`.
- **`services/portfolio.js`** — Portfolio CRUD + P&L: `create`, `get`, `list`, `update`, `remove`, `addHolding`, `removeHolding`, `getPerformance`, `refreshPrices`. Max 5 portfolios per user (enforced in `create`).
- **`services/auth.js`** — JWT auth: `register`, `login`, `verifyToken`, `getUser`, `invalidateSession`. bcryptjs password hashing. Max 5 sessions per user; oldest evicted when cap reached. Token expiry: 7 days.
- **`services/kite.js`** — Zerodha KiteConnect SDK wrapper. Auth flow, position sizing by capital-per-stock, dry run mode, order placement.

### Middleware

- **`middleware/requireAuth.js`** — Extracts `Bearer` token from `Authorization` header, validates JWT, attaches `req.user` and `req.token`.

### Persistence

SQLite at `data/momentum.db` (WAL mode, foreign keys ON). Tables:

| Table | Purpose |
|---|---|
| `scan_results` | Scan run metadata |
| `scan_scores` | Per-symbol scores for a scan |
| `backtest_results` | Backtest run + full result JSON |
| `orders` | Rebalance orders (Kite) |
| `strategies` | Named formula strategies |
| `portfolios` | User portfolios (scoped by `user_id`) |
| `portfolio_holdings` | Holdings within a portfolio |
| `users` | Auth: email + bcrypt hash + plan |
| `sessions` | JWT session tokens with expiry |

### Rate Limiting

In-memory per-IP limiter (no Redis). Two tiers:
- **Auth routes**: 10 requests / 15 minutes
- **Heavy routes** (scanner, score, backtest, optimize): 30 requests / 10 minutes

### Frontend

`frontend/` is Vite + React 18 + Recharts. Build output → `public/` (served by Express).

Components: `Layout`, `LoginPage`, `RegisterPage`, `ScannerPanel`, `BacktestPanel`, `OptimizerPanel`, `RebalancePanel`, `StrategiesPanel`, `PortfolioManager`, `PortfolioDetail`, `IntradayScoring`, `ResultsTable`, `ScoreChart`, `DrawdownChart`, `HeatmapTable`, `PresetCards`, `QuantityCalculator`, `SipCalculator`, `Pagination`.

Context: `AuthContext` (JWT, user state, login/logout).

### Static Data

- `data/universes/*.json` — Symbol lists (nifty50/100/200/250/500), no `.NS` suffix. Refreshed via `scripts/fetch-universes.js`.
- `data/sectors.json` — Symbol → sector mapping.
- `data/presets.json` — Preset strategy definitions served to frontend.
