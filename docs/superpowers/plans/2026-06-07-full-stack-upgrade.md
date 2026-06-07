# Full Stack Upgrade — Momentum Quant SaaS

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the prototype into a production-grade quantitative momentum scanner with full universe scanning, real backtest engine, Zerodha Kite integration, persistent results, and a modern React frontend.

**Architecture:** Express API stays as backend. Add SQLite (via better-sqlite3) for scan result persistence and backtest caching — no external DB dependency (remove unused mongoose). Extract shared Yahoo Finance fetch logic into `services/yahoo.js` to avoid duplication across scanner and backtest. Move frontend from single HTML file to Vite + React SPA. Scanner becomes configurable and scans full universe. Kite integration uses `kiteconnect` SDK with proper order flow.

**Tech Stack:** Node.js 18+, Express, better-sqlite3, yahoo-finance2, kiteconnect, Vite, React 18, Recharts

---

## File Structure

```
momentum-quant-saas/
├── .gitignore                         # NEW: ignore node_modules, .env, *.db, etc.
├── .env.example                       # NEW: template for required env vars
├── server.js                          # MODIFY: add new routes, DB init, PORT from env
├── db.js                              # NEW: SQLite setup + schema
├── services/
│   ├── yahoo.js                       # NEW: shared Yahoo Finance fetch + rate-limit logic
│   ├── scanner.js                     # MODIFY: configurable params, full universe, persist results
│   ├── backtest.js                    # REWRITE: real backtest engine (uses yahoo.js)
│   ├── optimizer.js                   # REWRITE: parameter sweep against backtest
│   └── kite.js                        # REWRITE: real Kite API integration
├── frontend/                          # NEW: Vite + React app
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── api.js                     # API client
│       ├── components/
│       │   ├── ScannerPanel.jsx
│       │   ├── ResultsTable.jsx
│       │   ├── ScoreChart.jsx
│       │   ├── BacktestPanel.jsx
│       │   ├── OptimizerPanel.jsx
│       │   ├── RebalancePanel.jsx
│       │   └── Layout.jsx
│       └── styles/
│           └── globals.css
├── data/universes/                    # Unchanged
├── scripts/                           # Unchanged
└── docs/
```

---

### Task 0: Project Hygiene — .gitignore, .env.example, Remove Dead Code

**Files:**
- Create: `.gitignore`
- Create: `.env.example`
- Modify: `package.json` (remove `mongoose`, add `nodemon` as devDependency)
- Modify: `server.js` (use `PORT` from env)
- Modify: `INSTRUCTIONS.md` (remove MongoDB reference)
- Delete: `nifty500.json` (stale root-level duplicate of `data/universes/nifty500.json`)

- [ ] **Step 1: Create `.gitignore`**

```gitignore
node_modules/
.env
data/*.db
frontend/node_modules/
frontend/dist/
*.log
```

- [ ] **Step 2: Create `.env.example`**

```env
# Yahoo Finance (optional — defaults to query1)
YF_QUERY_HOST=query1.finance.yahoo.com

# Zerodha Kite (required for live trading)
KITE_API_KEY=
KITE_API_SECRET=
KITE_ACCESS_TOKEN=

# Server
PORT=3000

# Database (optional — defaults to data/momentum.db)
DB_PATH=
```

- [ ] **Step 3: Remove mongoose, add nodemon as devDependency**

```bash
npm uninstall mongoose
npm install --save-dev nodemon
```

- [ ] **Step 4: Use PORT env var in server.js**

Change line 60 of `server.js` from:

```js
app.listen(3000, () => console.log("Server running on http://localhost:3000"))
```

to:

```js
const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`))
```

- [ ] **Step 5: Fix INSTRUCTIONS.md — remove MongoDB reference**

Replace line 4:

```
2. Install MongoDB
```

with:

```
2. Copy .env.example to .env and fill in values
```

- [ ] **Step 6: Delete stale root nifty500.json**

```bash
rm nifty500.json
```

This file is a duplicate — the canonical data lives at `data/universes/nifty500.json`.

- [ ] **Step 7: Commit**

```bash
git add .gitignore .env.example package.json package-lock.json server.js INSTRUCTIONS.md
git rm nifty500.json
git commit -m "chore: add .gitignore, .env.example, remove dead mongoose dep, fix port"
```

---

### Task 1: Add SQLite Persistence Layer

**Files:**
- Create: `db.js`
- Modify: `server.js` (add DB init on startup, add scan history endpoints)
- Modify: `package.json` (add `better-sqlite3`)

- [ ] **Step 1: Install better-sqlite3**

```bash
npm install better-sqlite3
```

- [ ] **Step 2: Create `db.js` with schema**

```js
const Database = require("better-sqlite3")
const path = require("path")

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data", "momentum.db")
const db = new Database(DB_PATH)

db.pragma("journal_mode = WAL")
db.pragma("foreign_keys = ON")

db.exec(`
  CREATE TABLE IF NOT EXISTS scan_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    universe TEXT NOT NULL,
    scanned_at TEXT NOT NULL DEFAULT (datetime('now')),
    scan_limit INTEGER NOT NULL,
    symbols_scanned INTEGER NOT NULL,
    config_json TEXT
  );

  CREATE TABLE IF NOT EXISTS scan_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id INTEGER NOT NULL REFERENCES scan_results(id),
    rank INTEGER NOT NULL,
    symbol TEXT NOT NULL,
    score REAL NOT NULL,
    momentum REAL NOT NULL,
    volatility REAL NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_scan_scores_scan_id ON scan_scores(scan_id);
  CREATE INDEX IF NOT EXISTS idx_scan_results_universe ON scan_results(universe);

  CREATE TABLE IF NOT EXISTS backtest_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    universe TEXT NOT NULL,
    config_json TEXT NOT NULL,
    ran_at TEXT NOT NULL DEFAULT (datetime('now')),
    cagr REAL,
    sharpe REAL,
    max_drawdown REAL,
    total_return REAL,
    result_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id INTEGER REFERENCES scan_results(id),
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    price REAL,
    order_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    placed_at TEXT NOT NULL DEFAULT (datetime('now')),
    filled_at TEXT,
    error TEXT
  );
`)

module.exports = db
```

- [ ] **Step 3: Wire DB init into server.js and add scan history endpoints**

Add at top of `server.js`, after dotenv:

```js
const db = require("./db")
```

Add endpoints before `app.listen()`:

```js
app.get("/api/scans", handle(async (req, res) => {
  const { universe, limit = 20 } = req.query
  let query = `SELECT * FROM scan_results`
  const params = []
  if (universe) {
    query += ` WHERE universe = ?`
    params.push(universe)
  }
  query += ` ORDER BY scanned_at DESC LIMIT ?`
  params.push(Number(limit))
  const scans = db.prepare(query).all(...params)
  res.json({ scans })
}))

app.get("/api/scans/:id", handle(async (req, res) => {
  const scan = db.prepare("SELECT * FROM scan_results WHERE id = ?").get(req.params.id)
  if (!scan) return res.status(404).json({ error: "Scan not found" })
  const scores = db.prepare("SELECT * FROM scan_scores WHERE scan_id = ? ORDER BY rank").all(scan.id)
  res.json({ ...scan, scores })
}))
```

- [ ] **Step 4: Verify DB creates on startup**

```bash
npm start
# Check data/momentum.db exists
ls -la data/momentum.db
```

- [ ] **Step 5: Commit**

```bash
git add db.js server.js package.json package-lock.json
git commit -m "feat: add SQLite persistence layer with scan/backtest/order tables"
```

---

### Task 2: Extract Shared Yahoo Finance Module

**Files:**
- Create: `services/yahoo.js`

This module extracts the duplicated Yahoo Finance logic (UA rotation, rate limiting, retry, fetchChart) so both scanner.js and backtest.js can share it.

- [ ] **Step 1: Create `services/yahoo.js`**

```js
const yahooFinance = require("yahoo-finance2").default

yahooFinance.suppressNotices(["ripHistorical"])

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
]

yahooFinance.setGlobalConfig({
  queue: { concurrency: 1, timeout: 60000 },
  YF_QUERY_HOST: process.env.YF_QUERY_HOST || "query1.finance.yahoo.com",
})

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

const isRateLimited = (e) => {
  const msg = String(e?.message || e || "")
  return msg.includes("Too Many Requests") || msg.includes("invalid json") || msg.includes("invalid-json")
}

function getModuleOpts(uaIndex = 0) {
  return {
    fetchOptions: {
      headers: {
        "User-Agent": USER_AGENTS[uaIndex % USER_AGENTS.length],
        Accept: "application/json",
        "Accept-Language": "en-US,en;q=0.9",
      },
    },
    queue: { concurrency: 1 },
  }
}

async function fetchChart(symbol, { period1 = "2010-01-01", retries = 4 } = {}) {
  for (let i = 0; i < retries; i++) {
    try {
      const opts = getModuleOpts(i)
      return await yahooFinance.chart(symbol + ".NS", {
        period1,
        interval: "1d",
        events: "",
        includePrePost: false,
      }, opts)
    } catch (e) {
      if (isRateLimited(e) && i < retries - 1) {
        const backoff = 5000 * (i + 1)
        console.warn(`Rate limited on ${symbol}, retry ${i + 1}/${retries} in ${backoff / 1000}s`)
        await delay(backoff)
      } else {
        throw e
      }
    }
  }
}

function isSkippable(e) {
  return /delisted|no data|not found/i.test(String(e?.message || ""))
}

module.exports = { fetchChart, delay, isSkippable }
```

- [ ] **Step 2: Commit**

```bash
git add services/yahoo.js
git commit -m "refactor: extract shared Yahoo Finance fetch logic into services/yahoo.js"
```

---

### Task 3: Upgrade Scanner — Full Universe, Configurable Params, Persistence

**Files:**
- Modify: `services/scanner.js`
- Modify: `server.js` (update scanner endpoint to accept config params)

- [ ] **Step 1: Rewrite scanner to use shared yahoo.js, add config, add persistence**

Rewrite `services/scanner.js`:

```js
const fs = require("fs")
const path = require("path")
const db = require("../db")
const { fetchChart, delay, isSkippable } = require("./yahoo")

const UNIVERSES_DIR = path.join(__dirname, "..", "data", "universes")
const DEFAULT_UNIVERSE = "nifty500"

const DEFAULT_CONFIG = {
  lookbacks: [21, 63, 126, 189],
  topN: 20,
  minDataPoints: 200,
  requestDelayMs: 4000,
  retries: 4,
}

function loadUniverse(name = DEFAULT_UNIVERSE) {
  const file = path.join(UNIVERSES_DIR, `${name}.json`)
  if (!fs.existsSync(file)) throw new Error(`Unknown universe: ${name}`)
  return JSON.parse(fs.readFileSync(file))
}

function calcMomentum(closes, lookbacks) {
  return lookbacks.reduce((sum, lb) => {
    if (lb >= closes.length) return sum
    const current = closes[closes.length - 1]
    const past = closes[closes.length - 1 - lb]
    if (!past || past <= 0) return sum
    const roc = (current - past) / past
    return sum + (isFinite(roc) ? roc : 0)
  }, 0)
}

function calcVolatility(closes) {
  const logReturns = []
  for (let i = 1; i < closes.length; i++) {
    const r = Math.log(closes[i] / closes[i - 1])
    if (isFinite(r)) logReturns.push(r)
  }
  if (logReturns.length < 2) return 0
  const n = logReturns.length
  const mean = logReturns.reduce((a, b) => a + b, 0) / n
  const variance = logReturns.reduce((a, r) => a + (r - mean) ** 2, 0) / (n - 1)
  return Math.sqrt(variance * 252)
}

async function scan(opts = {}) {
  const universeName = opts.universe || DEFAULT_UNIVERSE
  const config = { ...DEFAULT_CONFIG, ...opts.config }
  const limit = opts.limit || null
  const universe = loadUniverse(universeName)
  const symbols = limit ? universe.slice(0, limit) : universe
  const scores = []
  let scanned = 0

  await delay(3000)

  for (const symbol of symbols) {
    let result
    try {
      result = await fetchChart(symbol, { retries: config.retries })
    } catch (e) {
      if (isSkippable(e)) {
        console.warn(`Skip ${symbol}: ${e.message}`)
        await delay(config.requestDelayMs)
        continue
      }
      throw e
    }

    const data = result?.quotes ?? []
    if (data.length < config.minDataPoints) {
      await delay(config.requestDelayMs)
      continue
    }

    const closes = data.map((d) => d.close).filter((c) => c != null && c > 0)
    const momentum = calcMomentum(closes, config.lookbacks)
    const volatility = calcVolatility(closes)

    scores.push({ symbol, score: momentum - volatility, momentum, volatility })
    scanned++
    await delay(config.requestDelayMs)
  }

  scores.sort((a, b) => b.score - a.score)
  const top = scores.slice(0, config.topN)

  const insertScan = db.prepare(`
    INSERT INTO scan_results (universe, scan_limit, symbols_scanned, config_json)
    VALUES (?, ?, ?, ?)
  `)
  const insertScore = db.prepare(`
    INSERT INTO scan_scores (scan_id, rank, symbol, score, momentum, volatility)
    VALUES (?, ?, ?, ?, ?, ?)
  `)

  const saveScan = db.transaction(() => {
    const { lastInsertRowid } = insertScan.run(
      universeName, symbols.length, scanned, JSON.stringify(config)
    )
    top.forEach((s, i) => {
      insertScore.run(lastInsertRowid, i + 1, s.symbol, s.score, s.momentum, s.volatility)
    })
    return lastInsertRowid
  })

  const scanId = saveScan()

  return {
    scanId,
    top20: top,
    universe: universeName,
    symbolsScanned: scanned,
    totalInUniverse: symbols.length,
  }
}

module.exports = { scan, calcMomentum, calcVolatility, loadUniverse }
```

- [ ] **Step 2: Update scanner endpoint in server.js to accept config**

Replace the `/api/scanner` handler:

```js
app.get("/api/scanner", handle(async (req, res) => {
  const universe = req.query.universe || "nifty500"
  const limit = req.query.limit ? Number(req.query.limit) : null
  const config = {}
  if (req.query.topN) config.topN = Number(req.query.topN)
  if (req.query.lookbacks) config.lookbacks = req.query.lookbacks.split(",").map(Number)
  const result = await scanner.scan({ universe, limit, config })
  res.json(result)
}))
```

- [ ] **Step 3: Test scanner with limit**

```bash
curl "http://localhost:3000/api/scanner?universe=nifty50&limit=5"
# Verify response has scanId, symbolsScanned, totalInUniverse, top20 array with momentum/volatility fields
```

- [ ] **Step 4: Verify persistence**

```bash
curl "http://localhost:3000/api/scans"
# Should return the scan just run
```

- [ ] **Step 5: Commit**

```bash
git add services/scanner.js server.js
git commit -m "feat: scanner now configurable, scans full universe, persists results to SQLite"
```

---

### Task 4: Build Real Backtest Engine

**Files:**
- Rewrite: `services/backtest.js`
- Modify: `server.js` (update backtest endpoint, add backtest history)

- [ ] **Step 1: Implement backtest engine using shared yahoo.js**

Rewrite `services/backtest.js`:

```js
const fs = require("fs")
const path = require("path")
const db = require("../db")
const { fetchChart, delay, isSkippable } = require("./yahoo")
const { calcMomentum } = require("./scanner")

const UNIVERSES_DIR = path.join(__dirname, "..", "data", "universes")

function calcRollingVol(logReturns, idx, window = 63) {
  const start = Math.max(0, idx - window + 1)
  const slice = logReturns.slice(start, idx + 1)
  if (slice.length < 2) return 0
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length
  const variance = slice.reduce((a, r) => a + (r - mean) ** 2, 0) / (slice.length - 1)
  return Math.sqrt(variance * 252)
}

async function run(params = {}) {
  const {
    universe = "nifty50",
    startDate = "2018-01-01",
    endDate = new Date().toISOString().slice(0, 10),
    rebalanceFrequency = 21,
    topN = 10,
    lookbacks = [21, 63, 126, 189],
    initialCapital = 1000000,
    symbolLimit = 30,
  } = params

  const file = path.join(UNIVERSES_DIR, `${universe}.json`)
  if (!fs.existsSync(file)) throw new Error(`Unknown universe: ${universe}`)
  const symbols = JSON.parse(fs.readFileSync(file)).slice(0, symbolLimit)

  const priceData = {}
  for (const symbol of symbols) {
    try {
      const result = await fetchChart(symbol, { period1: "2015-01-01", retries: 3 })
      const quotes = result?.quotes ?? []
      if (quotes.length > 200) {
        priceData[symbol] = quotes
      }
    } catch (e) {
      if (isSkippable(e)) {
        console.warn(`Backtest skip ${symbol}: ${e.message}`)
      } else {
        console.warn(`Backtest skip ${symbol}: ${e.message}`)
      }
    }
    await delay(2000)
  }

  const validSymbols = Object.keys(priceData)
  if (validSymbols.length === 0) throw new Error("No valid price data fetched")

  const refSymbol = validSymbols[0]
  const dateIndex = priceData[refSymbol]
    .map((q) => q.date.toISOString().slice(0, 10))
    .filter((d) => d >= startDate && d <= endDate)

  let capital = initialCapital
  const equityCurve = []
  let holdings = {}

  for (let di = 200; di < dateIndex.length; di++) {
    const date = dateIndex[di]

    if ((di - 200) % rebalanceFrequency === 0) {
      const scores = []
      for (const sym of validSymbols) {
        const quotes = priceData[sym]
        const closes = quotes.map((q) => q.close).filter((c) => c != null && c > 0)
        const matchIdx = quotes.findIndex((q) => q.date.toISOString().slice(0, 10) >= date)
        if (matchIdx < 0 || matchIdx < Math.max(...lookbacks)) continue

        const closesUpToDate = closes.slice(0, matchIdx + 1)
        const momentum = calcMomentum(closesUpToDate, lookbacks)

        const logReturns = []
        for (let j = 1; j <= matchIdx; j++) {
          const r = Math.log(closes[j] / closes[j - 1])
          if (isFinite(r)) logReturns.push(r)
        }
        const vol = calcRollingVol(logReturns, logReturns.length - 1)
        scores.push({ symbol: sym, score: momentum - vol, price: closes[matchIdx] })
      }

      scores.sort((a, b) => b.score - a.score)
      const selected = scores.slice(0, topN)

      const portfolioValue = Object.entries(holdings).reduce((sum, [sym, qty]) => {
        const quotes = priceData[sym]
        const matchIdx = quotes.findIndex((q) => q.date.toISOString().slice(0, 10) >= date)
        const price = matchIdx >= 0 ? quotes[matchIdx].close : 0
        return sum + qty * price
      }, capital)

      const perStock = portfolioValue / selected.length
      holdings = {}
      capital = 0

      for (const s of selected) {
        if (s.price > 0) {
          holdings[s.symbol] = Math.floor(perStock / s.price)
          capital += perStock - holdings[s.symbol] * s.price
        }
      }
    }

    let portfolioValue = capital
    for (const [sym, qty] of Object.entries(holdings)) {
      const quotes = priceData[sym]
      const matchIdx = quotes.findIndex((q) => q.date.toISOString().slice(0, 10) >= date)
      const price = matchIdx >= 0 ? quotes[matchIdx].close : 0
      portfolioValue += qty * price
    }

    equityCurve.push({ date, value: portfolioValue })
  }

  const finalValue = equityCurve[equityCurve.length - 1]?.value || initialCapital
  const years = equityCurve.length / 252
  const totalReturn = (finalValue - initialCapital) / initialCapital
  const cagr = years > 0 ? (Math.pow(finalValue / initialCapital, 1 / years) - 1) : 0

  let peak = 0
  let maxDrawdown = 0
  for (const point of equityCurve) {
    if (point.value > peak) peak = point.value
    const dd = (peak - point.value) / peak
    if (dd > maxDrawdown) maxDrawdown = dd
  }

  const dailyReturns = []
  for (let i = 1; i < equityCurve.length; i++) {
    dailyReturns.push(equityCurve[i].value / equityCurve[i - 1].value - 1)
  }
  const avgReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length
  const stdReturn = Math.sqrt(
    dailyReturns.reduce((a, r) => a + (r - avgReturn) ** 2, 0) / (dailyReturns.length - 1)
  )
  const sharpe = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(252) : 0

  const result = {
    universe,
    startDate,
    endDate,
    totalReturn: +(totalReturn * 100).toFixed(2),
    cagr: +(cagr * 100).toFixed(2),
    sharpe: +sharpe.toFixed(3),
    maxDrawdown: +(maxDrawdown * 100).toFixed(2),
    finalValue: Math.round(finalValue),
    initialCapital,
    symbolsUsed: validSymbols.length,
    rebalances: Math.floor((dateIndex.length - 200) / rebalanceFrequency),
    equityCurve: equityCurve.filter((_, i) => i % 5 === 0),
  }

  db.prepare(`
    INSERT INTO backtest_results (universe, config_json, cagr, sharpe, max_drawdown, total_return, result_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    universe, JSON.stringify(params),
    result.cagr, result.sharpe, result.maxDrawdown, result.totalReturn,
    JSON.stringify(result)
  )

  return result
}

module.exports = { run }
```

- [ ] **Step 2: Update backtest endpoint in server.js and add history**

Replace the `/api/backtest` handler and add history endpoint:

```js
app.post("/api/backtest", handle(async (req, res) => {
  const result = await backtest.run(req.body)
  res.json(result)
}))

app.get("/api/backtests", handle(async (req, res) => {
  const results = db.prepare(
    "SELECT id, universe, cagr, sharpe, max_drawdown, total_return, ran_at FROM backtest_results ORDER BY ran_at DESC LIMIT 20"
  ).all()
  res.json({ results })
}))
```

- [ ] **Step 3: Test backtest with small universe**

```bash
curl -X POST http://localhost:3000/api/backtest \
  -H "Content-Type: application/json" \
  -d '{"universe":"nifty50","symbolLimit":5,"topN":3}'
# Verify response has cagr, sharpe, maxDrawdown, equityCurve array
```

- [ ] **Step 4: Commit**

```bash
git add services/backtest.js server.js
git commit -m "feat: real backtest engine with equity curve, CAGR, Sharpe, max drawdown"
```

---

### Task 5: Build Real Optimizer (Parameter Sweep)

**Files:**
- Rewrite: `services/optimizer.js`
- Modify: `server.js` (update optimize endpoint)

- [ ] **Step 1: Implement optimizer with parameter grid search**

Rewrite `services/optimizer.js`:

```js
const backtest = require("./backtest")

const DEFAULT_GRID = {
  topN: [5, 10, 15, 20],
  rebalanceFrequency: [5, 10, 21, 42],
  lookbackSets: [
    [21, 63, 126, 189],
    [21, 63, 126, 252],
    [10, 42, 126, 189],
    [63, 126, 189, 252],
  ],
}

async function run(params = {}) {
  const {
    universe = "nifty50",
    symbolLimit = 15,
    grid = DEFAULT_GRID,
  } = params

  const results = []
  const combinations = []

  for (const topN of grid.topN) {
    for (const rebalFreq of grid.rebalanceFrequency) {
      for (const lookbacks of grid.lookbackSets) {
        combinations.push({ topN, rebalanceFrequency: rebalFreq, lookbacks })
      }
    }
  }

  console.log(`Optimizer: ${combinations.length} combinations to test`)

  for (let i = 0; i < combinations.length; i++) {
    const combo = combinations[i]
    try {
      console.log(`[${i + 1}/${combinations.length}] topN=${combo.topN} rebal=${combo.rebalanceFrequency} lb=[${combo.lookbacks}]`)
      const result = await backtest.run({
        universe,
        symbolLimit,
        ...combo,
      })
      results.push({
        ...combo,
        cagr: result.cagr,
        sharpe: result.sharpe,
        maxDrawdown: result.maxDrawdown,
        totalReturn: result.totalReturn,
      })
    } catch (e) {
      console.warn(`Optimizer skip combo: ${e.message}`)
    }
  }

  results.sort((a, b) => b.sharpe - a.sharpe)

  return {
    best: results[0] || null,
    results,
    combinationsTested: results.length,
    totalCombinations: combinations.length,
  }
}

module.exports = { run }
```

- [ ] **Step 2: Update optimize endpoint in server.js**

Replace the `/api/optimize` handler:

```js
app.post("/api/optimize", handle(async (req, res) => {
  const result = await optimizer.run(req.body)
  res.json(result)
}))
```

- [ ] **Step 3: Test optimizer with small grid**

```bash
curl -X POST http://localhost:3000/api/optimize \
  -H "Content-Type: application/json" \
  -d '{"universe":"nifty50","symbolLimit":5,"grid":{"topN":[5,10],"rebalanceFrequency":[21],"lookbackSets":[[21,63,126,189]]}}'
# Verify response has best, results array, combinationsTested
```

- [ ] **Step 4: Commit**

```bash
git add services/optimizer.js server.js
git commit -m "feat: real optimizer with parameter grid search against backtest engine"
```

---

### Task 6: Implement Real Zerodha Kite Integration

**Files:**
- Rewrite: `services/kite.js`
- Modify: `server.js` (add order status endpoint, auth flow)
- Modify: `package.json` (add `kiteconnect`)

- [ ] **Step 1: Install kiteconnect**

```bash
npm install kiteconnect
```

- [ ] **Step 2: Rewrite kite.js with real API integration**

```js
const { KiteConnect } = require("kiteconnect")

let kite = null

function getKite() {
  if (!kite) {
    const apiKey = process.env.KITE_API_KEY
    if (!apiKey) throw new Error("KITE_API_KEY not set in environment")
    kite = new KiteConnect({ api_key: apiKey })
    const accessToken = process.env.KITE_ACCESS_TOKEN
    if (accessToken) {
      kite.setAccessToken(accessToken)
    }
  }
  return kite
}

function setAccessToken(token) {
  getKite().setAccessToken(token)
}

async function getLoginURL() {
  return getKite().getLoginURL()
}

async function generateSession(requestToken) {
  const apiSecret = process.env.KITE_API_SECRET
  if (!apiSecret) throw new Error("KITE_API_SECRET not set in environment")
  const k = getKite()
  const session = await k.generateSession(requestToken, apiSecret)
  k.setAccessToken(session.access_token)
  return session
}

async function getPositions() {
  return getKite().getPositions()
}

async function getHoldings() {
  return getKite().getHoldings()
}

async function placeOrder(symbol, quantity, side = "BUY") {
  const k = getKite()
  const params = {
    exchange: "NSE",
    tradingsymbol: symbol,
    transaction_type: side,
    quantity,
    product: "CNC",
    order_type: "MARKET",
    validity: "DAY",
  }
  return k.placeOrder("regular", params)
}

async function executeOrders(top20, { capitalPerStock = 50000, dryRun = false } = {}) {
  const k = getKite()
  const results = []

  for (const stock of top20) {
    try {
      const quote = await k.getQuote([`NSE:${stock.symbol}`])
      const ltp = quote[`NSE:${stock.symbol}`]?.last_price
      if (!ltp || ltp <= 0) {
        results.push({ symbol: stock.symbol, status: "skipped", reason: "no price" })
        continue
      }

      const quantity = Math.floor(capitalPerStock / ltp)
      if (quantity <= 0) {
        results.push({ symbol: stock.symbol, status: "skipped", reason: "quantity 0" })
        continue
      }

      if (dryRun) {
        results.push({ symbol: stock.symbol, status: "dry_run", quantity, price: ltp })
        continue
      }

      const order = await placeOrder(stock.symbol, quantity, "BUY")
      results.push({
        symbol: stock.symbol,
        status: "placed",
        orderId: order.order_id,
        quantity,
        price: ltp,
      })
    } catch (e) {
      results.push({ symbol: stock.symbol, status: "error", error: e.message })
    }
  }

  return results
}

module.exports = {
  getLoginURL,
  generateSession,
  setAccessToken,
  getPositions,
  getHoldings,
  placeOrder,
  executeOrders,
}
```

- [ ] **Step 3: Add Kite auth and order endpoints in server.js**

Add new endpoints:

```js
app.get("/api/kite/login", handle(async (req, res) => {
  const url = await kite.getLoginURL()
  res.json({ loginUrl: url })
}))

app.post("/api/kite/session", handle(async (req, res) => {
  const { requestToken } = req.body
  const session = await kite.generateSession(requestToken)
  res.json({ accessToken: session.access_token })
}))

app.get("/api/kite/positions", handle(async (req, res) => {
  const positions = await kite.getPositions()
  res.json(positions)
}))

app.get("/api/kite/holdings", handle(async (req, res) => {
  const holdings = await kite.getHoldings()
  res.json(holdings)
}))
```

Update rebalance handler to support dry run and persist orders:

```js
app.post("/api/rebalance", handle(async (req, res) => {
  const { execute, dryRun = true, universe = "nifty500", capitalPerStock = 50000 } = req.body
  const result = await scanner.scan({ universe })
  if (execute) {
    const orders = await kite.executeOrders(result.top20, { capitalPerStock, dryRun })
    const insertOrder = db.prepare(`
      INSERT INTO orders (scan_id, symbol, side, quantity, price, order_id, status, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const saveOrders = db.transaction(() => {
      for (const o of orders) {
        insertOrder.run(
          result.scanId, o.symbol, "BUY", o.quantity || 0, o.price || null,
          o.orderId || null, o.status, o.error || null
        )
      }
    })
    saveOrders()
    res.json({ executed: true, dryRun, orders, data: result.top20 })
  } else {
    res.json({ executed: false, data: result.top20 })
  }
}))
```

- [ ] **Step 4: Commit**

```bash
git add services/kite.js server.js package.json package-lock.json
git commit -m "feat: real Zerodha Kite integration with auth flow, position sizing, dry run"
```

---

### Task 7: Scaffold React Frontend with Vite

**Files:**
- Create: `frontend/` directory with Vite + React

- [ ] **Step 1: Scaffold Vite React app**

```bash
cd frontend
npm create vite@latest . -- --template react
npm install
npm install recharts
```

- [ ] **Step 2: Configure Vite proxy to Express backend**

Create `frontend/vite.config.js`:

```js
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "../public",
    emptyOutDir: true,
  },
})
```

- [ ] **Step 3: Create API client**

Create `frontend/src/api.js`:

```js
const BASE = ""

async function request(path, opts = {}) {
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || "Request failed")
  return data
}

export const api = {
  scan: (universe, limit) =>
    request(`/api/scanner?universe=${encodeURIComponent(universe)}${limit ? `&limit=${limit}` : ""}`),

  getScans: (universe) =>
    request(`/api/scans${universe ? `?universe=${encodeURIComponent(universe)}` : ""}`),

  getScan: (id) => request(`/api/scans/${id}`),

  backtest: (params) =>
    request("/api/backtest", { method: "POST", body: JSON.stringify(params) }),

  getBacktests: () => request("/api/backtests"),

  optimize: (params) =>
    request("/api/optimize", { method: "POST", body: JSON.stringify(params) }),

  rebalance: (params) =>
    request("/api/rebalance", { method: "POST", body: JSON.stringify(params) }),

  getUniverses: () => request("/api/universes"),

  kiteLogin: () => request("/api/kite/login"),
  kitePositions: () => request("/api/kite/positions"),
  kiteHoldings: () => request("/api/kite/holdings"),
}
```

- [ ] **Step 4: Create Layout component**

Create `frontend/src/components/Layout.jsx`:

```jsx
const tabs = [
  { id: "scanner", label: "Scanner" },
  { id: "backtest", label: "Backtest" },
  { id: "optimizer", label: "Optimizer" },
  { id: "rebalance", label: "Rebalance" },
]

export default function Layout({ activeTab, onTabChange, children }) {
  return (
    <div className="app">
      <header>
        <h1>Momentum Quant</h1>
        <p className="subtitle">NIFTY Momentum Scanner & Backtester</p>
      </header>
      <nav className="tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <main>{children}</main>
    </div>
  )
}
```

- [ ] **Step 5: Create ResultsTable component**

Create `frontend/src/components/ResultsTable.jsx`:

```jsx
export default function ResultsTable({ scores, title }) {
  if (!scores || scores.length === 0) {
    return <div className="empty">No results</div>
  }

  return (
    <div className="results-card">
      {title && <h3>{title}</h3>}
      <table className="results-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Symbol</th>
            <th>Score</th>
            <th>Momentum</th>
            <th>Volatility</th>
          </tr>
        </thead>
        <tbody>
          {scores.map((row, i) => (
            <tr key={row.symbol}>
              <td className="rank">{i + 1}</td>
              <td className="symbol">{row.symbol}</td>
              <td className={`score ${row.score >= 0 ? "positive" : "negative"}`}>
                {row.score.toFixed(4)}
              </td>
              <td>{row.momentum?.toFixed(4) ?? "—"}</td>
              <td>{row.volatility?.toFixed(4) ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 6: Create ScoreChart component**

Create `frontend/src/components/ScoreChart.jsx`:

```jsx
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts"

export default function ScoreChart({ scores }) {
  if (!scores || scores.length === 0) return null

  const data = scores.map((s) => ({
    symbol: s.symbol,
    score: +s.score.toFixed(4),
  }))

  return (
    <div className="chart-container">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 40 }}>
          <XAxis dataKey="symbol" angle={-45} textAnchor="end" fontSize={11} />
          <YAxis fontSize={12} />
          <Tooltip />
          <Bar dataKey="score">
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.score >= 0 ? "#22c55e" : "#ef4444"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 7: Create ScannerPanel component**

Create `frontend/src/components/ScannerPanel.jsx`:

```jsx
import { useState } from "react"
import { api } from "../api"
import ResultsTable from "./ResultsTable"
import ScoreChart from "./ScoreChart"

export default function ScannerPanel() {
  const [universe, setUniverse] = useState("nifty500")
  const [limit, setLimit] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  async function runScan() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.scan(universe, limit ? Number(limit) : undefined)
      setResult(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="panel">
      <div className="controls">
        <div className="control-group">
          <label>Universe</label>
          <select value={universe} onChange={(e) => setUniverse(e.target.value)}>
            <option value="nifty50">NIFTY 50</option>
            <option value="nifty100">NIFTY 100</option>
            <option value="nifty200">NIFTY 200</option>
            <option value="nifty250">NIFTY 250</option>
            <option value="nifty500">NIFTY 500</option>
          </select>
        </div>
        <div className="control-group">
          <label>Limit</label>
          <input
            type="number"
            placeholder="All"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            min="1"
            max="500"
          />
        </div>
        <button className="primary" onClick={runScan} disabled={loading}>
          {loading ? "Scanning..." : "Run Scanner"}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {result && (
        <>
          <div className="meta">
            Scanned {result.symbolsScanned}/{result.totalInUniverse} symbols
            · Scan #{result.scanId}
          </div>
          <ScoreChart scores={result.top20} />
          <ResultsTable scores={result.top20} />
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 8: Create BacktestPanel component**

Create `frontend/src/components/BacktestPanel.jsx`:

```jsx
import { useState } from "react"
import { api } from "../api"
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"

export default function BacktestPanel() {
  const [universe, setUniverse] = useState("nifty50")
  const [symbolLimit, setSymbolLimit] = useState(20)
  const [topN, setTopN] = useState(10)
  const [rebalFreq, setRebalFreq] = useState(21)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  async function runBacktest() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.backtest({
        universe,
        symbolLimit: Number(symbolLimit),
        topN: Number(topN),
        rebalanceFrequency: Number(rebalFreq),
      })
      setResult(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="panel">
      <div className="controls">
        <div className="control-group">
          <label>Universe</label>
          <select value={universe} onChange={(e) => setUniverse(e.target.value)}>
            <option value="nifty50">NIFTY 50</option>
            <option value="nifty100">NIFTY 100</option>
            <option value="nifty200">NIFTY 200</option>
          </select>
        </div>
        <div className="control-group">
          <label>Symbols</label>
          <input type="number" value={symbolLimit} onChange={(e) => setSymbolLimit(e.target.value)} min="5" max="100" />
        </div>
        <div className="control-group">
          <label>Top N</label>
          <input type="number" value={topN} onChange={(e) => setTopN(e.target.value)} min="3" max="30" />
        </div>
        <div className="control-group">
          <label>Rebal (days)</label>
          <input type="number" value={rebalFreq} onChange={(e) => setRebalFreq(e.target.value)} min="1" max="252" />
        </div>
        <button className="primary" onClick={runBacktest} disabled={loading}>
          {loading ? "Running..." : "Run Backtest"}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {result && (
        <>
          <div className="metrics-grid">
            <div className="metric">
              <span className="metric-label">CAGR</span>
              <span className={`metric-value ${result.cagr >= 0 ? "positive" : "negative"}`}>
                {result.cagr}%
              </span>
            </div>
            <div className="metric">
              <span className="metric-label">Sharpe</span>
              <span className="metric-value">{result.sharpe}</span>
            </div>
            <div className="metric">
              <span className="metric-label">Max DD</span>
              <span className="metric-value negative">{result.maxDrawdown}%</span>
            </div>
            <div className="metric">
              <span className="metric-label">Total Return</span>
              <span className={`metric-value ${result.totalReturn >= 0 ? "positive" : "negative"}`}>
                {result.totalReturn}%
              </span>
            </div>
          </div>

          {result.equityCurve && (
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={result.equityCurve}>
                  <XAxis dataKey="date" tickFormatter={(d) => d.slice(0, 7)} fontSize={11} />
                  <YAxis fontSize={12} tickFormatter={(v) => `${(v / 100000).toFixed(1)}L`} />
                  <Tooltip formatter={(v) => `₹${v.toLocaleString()}`} />
                  <Line type="monotone" dataKey="value" stroke="#22c55e" dot={false} strokeWidth={1.5} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 9: Create OptimizerPanel component**

Create `frontend/src/components/OptimizerPanel.jsx`:

```jsx
import { useState } from "react"
import { api } from "../api"

export default function OptimizerPanel() {
  const [universe, setUniverse] = useState("nifty50")
  const [symbolLimit, setSymbolLimit] = useState(15)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  async function runOptimizer() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.optimize({ universe, symbolLimit: Number(symbolLimit) })
      setResult(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="panel">
      <div className="controls">
        <div className="control-group">
          <label>Universe</label>
          <select value={universe} onChange={(e) => setUniverse(e.target.value)}>
            <option value="nifty50">NIFTY 50</option>
            <option value="nifty100">NIFTY 100</option>
          </select>
        </div>
        <div className="control-group">
          <label>Symbols</label>
          <input type="number" value={symbolLimit} onChange={(e) => setSymbolLimit(e.target.value)} min="5" max="50" />
        </div>
        <button className="primary" onClick={runOptimizer} disabled={loading}>
          {loading ? "Optimizing..." : "Run Optimizer"}
        </button>
      </div>

      {loading && <div className="loading">Optimizer runs many backtests — this takes a while...</div>}
      {error && <div className="error">{error}</div>}

      {result && (
        <>
          {result.best && (
            <div className="best-result">
              <h3>Best Parameters (by Sharpe)</h3>
              <div className="metrics-grid">
                <div className="metric">
                  <span className="metric-label">Top N</span>
                  <span className="metric-value">{result.best.topN}</span>
                </div>
                <div className="metric">
                  <span className="metric-label">Rebal Freq</span>
                  <span className="metric-value">{result.best.rebalanceFrequency}d</span>
                </div>
                <div className="metric">
                  <span className="metric-label">Sharpe</span>
                  <span className="metric-value">{result.best.sharpe}</span>
                </div>
                <div className="metric">
                  <span className="metric-label">CAGR</span>
                  <span className="metric-value">{result.best.cagr}%</span>
                </div>
              </div>
              <p className="meta">Lookbacks: [{result.best.lookbacks.join(", ")}]</p>
            </div>
          )}

          <table className="results-table">
            <thead>
              <tr>
                <th>Top N</th>
                <th>Rebal</th>
                <th>Lookbacks</th>
                <th>Sharpe</th>
                <th>CAGR</th>
                <th>Max DD</th>
              </tr>
            </thead>
            <tbody>
              {result.results.slice(0, 20).map((r, i) => (
                <tr key={i} className={i === 0 ? "best-row" : ""}>
                  <td>{r.topN}</td>
                  <td>{r.rebalanceFrequency}d</td>
                  <td>[{r.lookbacks.join(",")}]</td>
                  <td>{r.sharpe}</td>
                  <td>{r.cagr}%</td>
                  <td>{r.maxDrawdown}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="meta">{result.combinationsTested}/{result.totalCombinations} tested</p>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 10: Create RebalancePanel component**

Create `frontend/src/components/RebalancePanel.jsx`:

```jsx
import { useState } from "react"
import { api } from "../api"
import ResultsTable from "./ResultsTable"

export default function RebalancePanel() {
  const [universe, setUniverse] = useState("nifty500")
  const [execute, setExecute] = useState(false)
  const [dryRun, setDryRun] = useState(true)
  const [capitalPerStock, setCapitalPerStock] = useState(50000)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  async function runRebalance() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.rebalance({
        universe,
        execute,
        dryRun,
        capitalPerStock: Number(capitalPerStock),
      })
      setResult(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="panel">
      <div className="controls">
        <div className="control-group">
          <label>Universe</label>
          <select value={universe} onChange={(e) => setUniverse(e.target.value)}>
            <option value="nifty50">NIFTY 50</option>
            <option value="nifty100">NIFTY 100</option>
            <option value="nifty200">NIFTY 200</option>
            <option value="nifty500">NIFTY 500</option>
          </select>
        </div>
        <div className="control-group">
          <label>₹/Stock</label>
          <input
            type="number"
            value={capitalPerStock}
            onChange={(e) => setCapitalPerStock(e.target.value)}
            min="10000"
            step="10000"
          />
        </div>
        <div className="toggle-wrap">
          <input type="checkbox" checked={execute} onChange={(e) => setExecute(e.target.checked)} />
          <label>Execute Orders</label>
        </div>
        {execute && (
          <div className="toggle-wrap">
            <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
            <label>Dry Run</label>
          </div>
        )}
        <button className="primary" onClick={runRebalance} disabled={loading}>
          {loading ? "Running..." : "Rebalance"}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {result && (
        <>
          {result.orders && (
            <table className="results-table">
              <thead>
                <tr><th>Symbol</th><th>Status</th><th>Qty</th><th>Price</th></tr>
              </thead>
              <tbody>
                {result.orders.map((o, i) => (
                  <tr key={i}>
                    <td className="symbol">{o.symbol}</td>
                    <td className={`status-${o.status}`}>{o.status}</td>
                    <td>{o.quantity || "—"}</td>
                    <td>{o.price ? `₹${o.price.toFixed(2)}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {result.data && <ResultsTable scores={result.data} title="Top Stocks" />}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 11: Create App.jsx**

Create `frontend/src/App.jsx`:

```jsx
import { useState } from "react"
import Layout from "./components/Layout"
import ScannerPanel from "./components/ScannerPanel"
import BacktestPanel from "./components/BacktestPanel"
import OptimizerPanel from "./components/OptimizerPanel"
import RebalancePanel from "./components/RebalancePanel"

export default function App() {
  const [tab, setTab] = useState("scanner")

  return (
    <Layout activeTab={tab} onTabChange={setTab}>
      {tab === "scanner" && <ScannerPanel />}
      {tab === "backtest" && <BacktestPanel />}
      {tab === "optimizer" && <OptimizerPanel />}
      {tab === "rebalance" && <RebalancePanel />}
    </Layout>
  )
}
```

- [ ] **Step 12: Create main.jsx entry point**

Create `frontend/src/main.jsx`:

```jsx
import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import "./styles/globals.css"

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 13: Create globals.css**

Create `frontend/src/styles/globals.css` — port dark theme from `public/index.html` with additions for new components:

```css
:root {
  --bg: #0f1419;
  --surface: #1a2332;
  --surface-hover: #232f42;
  --border: #2d3a4f;
  --text: #e6edf3;
  --text-muted: #8b9cb3;
  --accent: #22c55e;
  --accent-dim: #16a34a;
  --danger: #ef4444;
  --warning: #f59e0b;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: 'Outfit', -apple-system, sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  line-height: 1.5;
}

.app { max-width: 1000px; margin: 0 auto; padding: 2rem; }

header {
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border);
}

h1 { font-size: 1.75rem; font-weight: 700; letter-spacing: -0.02em; }
h3 { font-size: 1.1rem; font-weight: 600; margin-bottom: 0.75rem; }
.subtitle { margin-top: 0.25rem; font-size: 0.9rem; color: var(--text-muted); }

.tabs {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 1.5rem;
  border-bottom: 1px solid var(--border);
}

.tab {
  font-family: 'Outfit', sans-serif;
  font-size: 0.9rem;
  padding: 0.6rem 1.25rem;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.tab:hover { color: var(--text); }
.tab.active { color: var(--accent); border-bottom-color: var(--accent); }

.panel { display: flex; flex-direction: column; gap: 1.25rem; }

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: flex-end;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.control-group label {
  font-size: 0.75rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

select, input[type="number"] {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.85rem;
  padding: 0.5rem 0.75rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
}

select:hover, select:focus, input:hover, input:focus {
  border-color: var(--accent);
  outline: none;
}

input[type="number"] { width: 80px; }

button.primary {
  font-family: 'Outfit', sans-serif;
  font-size: 0.9rem;
  font-weight: 500;
  padding: 0.6rem 1.25rem;
  border: none;
  border-radius: 8px;
  background: var(--accent);
  color: var(--bg);
  cursor: pointer;
  transition: all 0.15s ease;
}

button.primary:hover:not(:disabled) { background: var(--accent-dim); transform: translateY(-1px); }
button.primary:disabled { opacity: 0.6; cursor: not-allowed; }

.toggle-wrap {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.toggle-wrap input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: var(--accent);
  cursor: pointer;
}

.results-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  padding: 1rem;
}

.results-table {
  width: 100%;
  border-collapse: collapse;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.85rem;
}

.results-table th, .results-table td { padding: 0.6rem 1rem; text-align: left; }
.results-table th { color: var(--text-muted); font-weight: 500; border-bottom: 1px solid var(--border); }
.results-table tr:not(:last-child) td { border-bottom: 1px solid rgba(45, 58, 79, 0.6); }
.results-table tr:hover td { background: var(--surface-hover); }

.rank { width: 48px; color: var(--text-muted); }
.symbol { font-weight: 600; color: var(--accent); }
.score { text-align: right; font-variant-numeric: tabular-nums; }
.positive { color: var(--accent); }
.negative { color: var(--danger); }

.best-row td { background: rgba(34, 197, 94, 0.08); }

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 1rem;
}

.metric {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.metric-label { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
.metric-value { font-family: 'JetBrains Mono', monospace; font-size: 1.25rem; font-weight: 600; }

.chart-container {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1rem;
}

.error {
  padding: 1rem;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  color: #fca5a5;
  font-size: 0.9rem;
}

.loading { padding: 2rem; text-align: center; color: var(--text-muted); }
.empty { text-align: center; padding: 3rem; color: var(--text-muted); }
.meta { font-size: 0.8rem; color: var(--text-muted); }

.best-result {
  background: var(--surface);
  border: 1px solid var(--accent);
  border-radius: 12px;
  padding: 1.25rem;
}

.status-placed { color: var(--accent); }
.status-dry_run { color: var(--warning); }
.status-error { color: var(--danger); }
.status-skipped { color: var(--text-muted); }

@media (max-width: 640px) {
  .app { padding: 1rem; }
  .controls { flex-direction: column; align-items: stretch; }
  .metrics-grid { grid-template-columns: repeat(2, 1fr); }
}
```

- [ ] **Step 14: Create frontend index.html**

Create `frontend/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Momentum Quant | NIFTY Scanner</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>
```

- [ ] **Step 15: Add dev scripts to root package.json**

Add to root `package.json` scripts:

```json
"frontend": "cd frontend && npm run dev",
"frontend:build": "cd frontend && npm run build"
```

- [ ] **Step 16: Verify frontend starts and connects to backend**

```bash
# Terminal 1
npm start

# Terminal 2
cd frontend && npm run dev

# Open http://localhost:5173
# Verify: tabs render, scanner form shows, API calls proxy to backend
```

- [ ] **Step 17: Commit**

```bash
git add frontend/ package.json
git commit -m "feat: React frontend with Vite — scanner, backtest, optimizer, rebalance panels"
```

---

### Task 8: Update CLAUDE.md with New Architecture

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Rewrite CLAUDE.md to reflect full new architecture**

Update to include:
- New commands (`npm run frontend`, `npm run frontend:build`)
- Two-terminal dev setup (backend :3000 + frontend :5173)
- SQLite persistence (`data/momentum.db`)
- `services/yahoo.js` as shared fetch module
- All services now functional (no stubs)
- All env vars including `KITE_API_SECRET`
- Updated endpoint table with new endpoints (`/api/scans`, `/api/scans/:id`, `/api/backtests`, `/api/kite/*`)
- Note that `public/` is build output of `frontend/`

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with full stack architecture"
```
