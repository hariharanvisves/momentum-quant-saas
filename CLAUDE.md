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
YF_QUERY_HOST=query1.finance.yahoo.com  # Optional
PORT=3000               # Optional
DB_PATH=                # Optional, defaults to data/momentum.db
```

## Architecture

Express backend (`server.js`) + Vite/React frontend (`frontend/`). SQLite persistence via `db.js` (better-sqlite3, WAL mode). Shared Yahoo Finance fetch logic in `services/yahoo.js`.

### API Endpoints

| Endpoint | Service | Notes |
|---|---|---|
| `GET /api/scanner?universe=&limit=&topN=&lookbacks=` | `scanner.js` | Configurable, persists results to DB |
| `GET /api/scans?universe=&limit=` | `db.js` | Scan history |
| `GET /api/scans/:id` | `db.js` | Single scan with scores |
| `POST /api/backtest` `{universe,symbolLimit,topN,rebalanceFrequency,lookbacks}` | `backtest.js` | Equity curve, CAGR, Sharpe, max DD |
| `GET /api/backtests` | `db.js` | Backtest history |
| `POST /api/optimize` `{universe,symbolLimit,grid}` | `optimizer.js` | Grid search over backtest params |
| `POST /api/rebalance` `{execute,dryRun,universe,capitalPerStock}` | `scanner.js` → `kite.js` | Orders persisted to DB |
| `GET /api/universes` | reads `data/universes/*.json` | |
| `GET /api/kite/login` | `kite.js` | Returns Zerodha login URL |
| `POST /api/kite/session` `{requestToken}` | `kite.js` | Exchange token for session |
| `GET /api/kite/positions` | `kite.js` | |
| `GET /api/kite/holdings` | `kite.js` | |

### Service Modules

- **`services/yahoo.js`** — Shared Yahoo Finance fetch with UA rotation, rate limiting (4s delay, 5-20s backoff), retry logic. Used by scanner and backtest.
- **`services/scanner.js`** — Momentum algorithm: ROC at configurable lookbacks (default 21/63/126/189) minus annualized volatility. Scans full universe by default. Exports `calcMomentum`, `calcVolatility`, `loadUniverse` for reuse.
- **`services/backtest.js`** — Historical simulation with periodic rebalancing. Fetches price data, runs momentum scoring at each rebalance, tracks equity curve. Calculates CAGR, Sharpe, max drawdown.
- **`services/optimizer.js`** — Grid search over topN, rebalance frequency, and lookback sets. Runs backtest for each combination, ranks by Sharpe.
- **`services/kite.js`** — Zerodha KiteConnect SDK wrapper. Auth flow, position sizing by capital-per-stock, dry run mode, order placement.

### Persistence

SQLite at `data/momentum.db`. Tables: `scan_results`, `scan_scores`, `backtest_results`, `orders`. Schema defined in `db.js`.

### Frontend

`frontend/` is a Vite + React 18 app with Recharts. Build output goes to `public/` (served by Express static). Components: ScannerPanel, BacktestPanel, OptimizerPanel, RebalancePanel, ResultsTable, ScoreChart, Layout.

### Stock Universes

JSON arrays of ticker symbols (without `.NS`) in `data/universes/`. Available: nifty50, nifty100, nifty200, nifty250, nifty500. Refreshed via `scripts/fetch-universes.js`.
