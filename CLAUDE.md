# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start              # Run server (port 3000)
npm run dev            # Run with nodemon (auto-reload)
npm run fetch-universes  # Refresh all stock universe JSON files
npm run fetch-nifty500   # Refresh only NIFTY 500 universe
```

No test runner or linter configured.

## Environment

Create `.env` in root:
```
KITE_API_KEY=your_key
KITE_ACCESS_TOKEN=your_token
YF_QUERY_HOST=query1.finance.yahoo.com   # optional; falls back to query1
```

## Architecture

Single Express server (`server.js`) with 5 endpoints, all backed by service modules:

| Endpoint | Service | Status |
|---|---|---|
| `GET /api/scanner?universe=nifty500` | `services/scanner.js` | Functional |
| `POST /api/rebalance` `{ universe, execute }` | `scanner.js` → `kite.js` | Scanner real; Kite stub |
| `POST /api/backtest` | `services/backtest.js` | Stub (returns placeholder) |
| `POST /api/optimize` | `services/optimizer.js` | Stub (returns random values) |
| `GET /api/universes` | reads `data/universes/*.json` | Functional |

### Momentum Algorithm (`services/scanner.js`)

1. Load symbols from `data/universes/<name>.json`
2. Fetch daily OHLCV from Yahoo Finance via `yahoo-finance2` (symbol appended with `.NS` for NSE)
3. For each symbol with ≥200 data points:
   - **Momentum** = sum of ROC at 21, 63, 126, 189 trading days
   - **Volatility** = annualized std of log returns (252-day factor, sample n-1)
   - **Score** = momentum − volatility
4. Sort descending, return top 20

Only 15 symbols are fetched per scan (`SCAN_LIMIT = 15`). 4s delay between requests; 5–20s exponential backoff on rate-limit errors. Yahoo Finance blocks bot UAs — 3 browser UAs are rotated per retry.

### Stock Universes

JSON files in `data/universes/` are arrays of ticker symbols (without `.NS`). Refreshed via scripts in `scripts/`. Available: `nifty50`, `nifty100`, `nifty200`, `nifty250`, `nifty500`.

### Kite Integration (`services/kite.js`)

Currently a stub — logs orders but doesn't call the Kite API. Needs `kiteconnect` npm package and real order placement logic. Called only when `execute: true` is passed to `/api/rebalance`.

### Frontend (`public/index.html`)

Single-file SPA. Calls the API endpoints above. Uses Chart.js 4.4 for any charts. No build step.

### Stubs to Implement

- `services/backtest.js` — described as needing DB cache + worker threads
- `services/optimizer.js` — currently returns random Sharpe/CAGR; needs real parameter sweep against backtest
- `services/kite.js` — needs actual Kite API order placement
