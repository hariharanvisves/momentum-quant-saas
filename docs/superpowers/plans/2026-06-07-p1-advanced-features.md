# P1: Advanced Features — Scoring UI, Enhanced Backtest UI, Regime Filter, FRR Rebalancing

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build SigmaScanner-equivalent frontend for scoring and backtesting, add regime filter and FRR rebalancing to backtest engine, add benchmark overlay and CSV download.

**Architecture:** P0 scoring engine provides `services/factors.js`, `services/formula.js`, `services/scoring.js`, POST /api/score, and CRUD for strategies. This plan extends the backtest engine with Supertrend-based regime filtering and Find-Remove-Replace rebalancing, adds benchmark index overlay to equity curves, builds rich SigmaScanner-style frontend panels for both scoring and backtesting, and adds CSV download + pagination endpoints. All new backend logic stays in existing service files or new focused modules. Frontend rewrites existing ScannerPanel and BacktestPanel components and adds QuantityCalculator as a new modal component.

**Tech Stack:** Node.js 18+, Express, better-sqlite3, yahoo-finance2, Vite, React 18, Recharts. No new dependencies required.

**Depends on (must be complete before starting):**
- P0 plan: scoring engine, `services/factors.js`, `services/formula.js`, `services/scoring.js`, `strategies` table, POST /api/score, strategy CRUD endpoints, enhanced backtest with 11 metrics

---

## File Structure (changes from P0 baseline)

```
momentum-quant-saas/
├── services/
│   ├── backtest.js                    # MODIFY: add FRR rebalancing, regime filter, benchmark overlay
│   ├── indicators.js                  # NEW: Supertrend indicator calculation
│   ├── scoring.js                     # EXISTS from P0 — add pagination support
│   ├── factors.js                     # EXISTS from P0 — unchanged
│   ├── formula.js                     # EXISTS from P0 — unchanged
│   ├── yahoo.js                       # EXISTS — unchanged
│   ├── scanner.js                     # EXISTS — unchanged
│   ├── kite.js                        # EXISTS — unchanged
│   └── optimizer.js                   # EXISTS — unchanged
├── server.js                          # MODIFY: add CSV download endpoints, paginated score endpoint
├── db.js                              # EXISTS — unchanged
├── frontend/src/
│   ├── api.js                         # MODIFY: add new API methods
│   ├── App.jsx                        # EXISTS — unchanged
│   ├── components/
│   │   ├── ScannerPanel.jsx           # REWRITE: full SigmaScanner scoring UI
│   │   ├── BacktestPanel.jsx          # REWRITE: full SigmaScanner backtest UI
│   │   ├── QuantityCalculator.jsx     # NEW: modal for capital allocation
│   │   ├── Pagination.jsx             # NEW: reusable pagination controls
│   │   ├── Layout.jsx                 # EXISTS — unchanged
│   │   ├── ResultsTable.jsx           # EXISTS — unchanged
│   │   ├── ScoreChart.jsx             # EXISTS — unchanged
│   │   ├── OptimizerPanel.jsx         # EXISTS — unchanged
│   │   └── RebalancePanel.jsx         # EXISTS — unchanged
│   └── styles/
│       └── globals.css                # MODIFY: add new component styles
└── data/
    └── sectors.json                   # NEW: symbol-to-sector mapping
```

---

### Task 1: Supertrend Indicator + Regime Filter in Backtest

**Why first:** The regime filter is a pure backend computation with no frontend dependency. It's the most algorithmically complex piece and other tasks don't depend on it, so isolating it early reduces risk.

**Files:**
- Create: `services/indicators.js`
- Modify: `services/backtest.js`

- [x] **Step 1: Create `services/indicators.js` with Supertrend calculation**

Create file at `services/indicators.js`:

```js
/**
 * Technical indicators for regime filtering.
 * Supertrend is an ATR-based trend-following indicator.
 * When price is above the Supertrend line, trend is bullish.
 * When price is below, trend is bearish.
 */

function calcATR(highs, lows, closes, period) {
  const trueRanges = []
  for (let i = 0; i < highs.length; i++) {
    if (i === 0) {
      trueRanges.push(highs[i] - lows[i])
    } else {
      const tr = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      )
      trueRanges.push(tr)
    }
  }

  const atr = new Array(trueRanges.length).fill(0)
  let sum = 0
  for (let i = 0; i < period && i < trueRanges.length; i++) {
    sum += trueRanges[i]
  }
  if (period <= trueRanges.length) {
    atr[period - 1] = sum / period
  }
  for (let i = period; i < trueRanges.length; i++) {
    atr[i] = (atr[i - 1] * (period - 1) + trueRanges[i]) / period
  }

  return atr
}

function calcSupertrend(highs, lows, closes, period = 10, multiplier = 3) {
  const n = closes.length
  if (n < period + 1) {
    return { trend: new Array(n).fill(1), supertrendLine: new Array(n).fill(0) }
  }

  const atr = calcATR(highs, lows, closes, period)

  const upperBand = new Array(n).fill(0)
  const lowerBand = new Array(n).fill(0)
  const finalUpperBand = new Array(n).fill(0)
  const finalLowerBand = new Array(n).fill(0)
  const supertrendLine = new Array(n).fill(0)
  const trend = new Array(n).fill(1) // 1 = bullish, -1 = bearish

  for (let i = 0; i < n; i++) {
    const hl2 = (highs[i] + lows[i]) / 2
    upperBand[i] = hl2 + multiplier * atr[i]
    lowerBand[i] = hl2 - multiplier * atr[i]
  }

  finalUpperBand[0] = upperBand[0]
  finalLowerBand[0] = lowerBand[0]

  for (let i = 1; i < n; i++) {
    finalLowerBand[i] = (lowerBand[i] > finalLowerBand[i - 1]) || (closes[i - 1] < finalLowerBand[i - 1])
      ? lowerBand[i]
      : finalLowerBand[i - 1]

    finalUpperBand[i] = (upperBand[i] < finalUpperBand[i - 1]) || (closes[i - 1] > finalUpperBand[i - 1])
      ? upperBand[i]
      : finalUpperBand[i - 1]
  }

  trend[0] = 1
  supertrendLine[0] = finalLowerBand[0]

  for (let i = 1; i < n; i++) {
    if (trend[i - 1] === 1) {
      trend[i] = closes[i] < finalLowerBand[i] ? -1 : 1
    } else {
      trend[i] = closes[i] > finalUpperBand[i] ? 1 : -1
    }
    supertrendLine[i] = trend[i] === 1 ? finalLowerBand[i] : finalUpperBand[i]
  }

  return { trend, supertrendLine }
}

module.exports = { calcSupertrend, calcATR }
```

- [x] **Step 2: Add regime filter logic to `services/backtest.js`**

This step modifies the existing `run()` function in `services/backtest.js` to accept regime filter params and reduce portfolio allocation when the index trend is bearish.

At the top of `services/backtest.js`, add the import after existing requires:

```js
const { calcSupertrend } = require("./indicators")
```

In the `run()` function, add `regimeFilter` to the destructured params. Replace the existing params block:

```js
  const {
    universe = "nifty50",
    startDate = "2018-01-01",
    endDate = new Date().toISOString().slice(0, 10),
    rebalanceFrequency = 21,
    topN = 10,
    lookbacks = [21, 63, 126, 189],
    initialCapital = 1000000,
    symbolLimit = 30,
    formula = null,
    exitRank = null,
    regimeFilter = null,
  } = params
```

After the price data fetch loop (after the `const validSymbols = Object.keys(priceData)` line), add the regime data preparation block:

```js
  // Prepare regime filter data if enabled
  let regimeData = null
  if (regimeFilter && regimeFilter.enabled) {
    const rf = regimeFilter
    const regimeIndex = rf.index || universe
    const regimePeriod = rf.period || 10
    const regimeMultiplier = rf.multiplier || 3

    // Use the first valid symbol's dates as reference to find index data
    // Fetch the index data if not already in priceData
    const indexSymbol = `^NSEI` // NIFTY 50 index — used as proxy
    let indexQuotes = null
    try {
      const yahooFinance = require("yahoo-finance2").default
      const indexResult = await yahooFinance.chart(indexSymbol, {
        period1: "2015-01-01",
        interval: "1d",
        events: "",
        includePrePost: false,
      })
      indexQuotes = indexResult?.quotes ?? []
    } catch (e) {
      console.warn(`Regime filter: failed to fetch index data: ${e.message}`)
    }

    if (indexQuotes && indexQuotes.length > regimePeriod + 1) {
      const highs = indexQuotes.map(q => q.high).filter(v => v != null && v > 0)
      const lows = indexQuotes.map(q => q.low).filter(v => v != null && v > 0)
      const closes = indexQuotes.map(q => q.close).filter(v => v != null && v > 0)
      const dates = indexQuotes.map(q => q.date.toISOString().slice(0, 10))

      const { trend } = calcSupertrend(highs, lows, closes, regimePeriod, regimeMultiplier)

      // Build date-to-trend lookup
      regimeData = {}
      for (let i = 0; i < dates.length; i++) {
        regimeData[dates[i]] = trend[i]
      }
    }
  }
```

Inside the rebalancing block (inside the `if ((di - 200) % rebalanceFrequency === 0)` conditional), after computing `selected` and before computing `perStock`, add the regime adjustment:

```js
      // Apply regime filter — reduce allocation when bearish
      let effectiveTopN = selected.length
      if (regimeData && regimeFilter) {
        const trendValue = regimeData[date]
        if (trendValue === -1) {
          const action = regimeFilter.action || "half_portfolio"
          if (action === "half_portfolio") {
            effectiveTopN = Math.max(1, Math.ceil(selected.length / 2))
          } else if (action === "quarter_portfolio") {
            effectiveTopN = Math.max(1, Math.ceil(selected.length / 4))
          } else if (action === "exit_all") {
            effectiveTopN = 0
          }
        }
      }

      const activeSelected = selected.slice(0, effectiveTopN)
```

Then replace the portfolio allocation code that follows. Change:

```js
      const perStock = portfolioValue / selected.length
      holdings = {}
      capital = 0

      for (const s of selected) {
```

to:

```js
      if (activeSelected.length === 0) {
        // Exit all — go to cash
        holdings = {}
        capital = portfolioValue
      } else {
        const perStock = portfolioValue / activeSelected.length
        holdings = {}
        capital = portfolioValue - (perStock * activeSelected.length) // remainder in cash if regime reduced

        for (const s of activeSelected) {
          if (s.price > 0) {
            holdings[s.symbol] = Math.floor(perStock / s.price)
            capital += perStock - holdings[s.symbol] * s.price
          }
        }

        // Cash from regime reduction stays as capital
        capital = portfolioValue
        for (const [sym, qty] of Object.entries(holdings)) {
          const quotes = priceData[sym]
          const matchIdx = quotes.findIndex((q) => q.date.toISOString().slice(0, 10) >= date)
          const price = matchIdx >= 0 ? quotes[matchIdx].close : 0
          capital -= qty * price
        }
      }
```

Remove the old `for (const s of selected)` allocation block and the old `capital +=` line since they're replaced above.

- [x] **Step 3: Test regime filter**

```bash
curl -X POST http://localhost:3000/api/backtest \
  -H "Content-Type: application/json" \
  -d '{
    "universe": "nifty50",
    "symbolLimit": 10,
    "topN": 5,
    "regimeFilter": {
      "enabled": true,
      "period": 10,
      "multiplier": 3,
      "action": "half_portfolio"
    }
  }'
```

Verify the response returns valid metrics and that the equity curve shows reduced exposure during bearish regimes (compare with a non-regime-filtered run — max drawdown should be lower).

- [x] **Step 4: Commit**

```bash
git add services/indicators.js services/backtest.js
git commit -m "feat: add Supertrend indicator and regime filter to backtest engine"
```

---

### Task 2: FRR Rebalancing Logic in Backtest (Exit Rank)

**Why second:** Like the regime filter, this is a pure backend logic change. It modifies how portfolio rebalancing works — instead of replacing the entire portfolio, it uses Find-Remove-Replace: keep stocks still within exit rank, sell those that dropped below, and fill vacated slots with new top-ranked stocks.

**Files:**
- Modify: `services/backtest.js`

- [x] **Step 1: Refactor the rebalancing block in `services/backtest.js` to support FRR**

The `exitRank` parameter was already added to the destructured params in Task 1. Now modify the rebalancing logic inside the `if ((di - 200) % rebalanceFrequency === 0)` block.

Replace the entire rebalancing block (everything inside the `if ((di - 200) % rebalanceFrequency === 0) { ... }` conditional) with this FRR-aware implementation:

```js
    if ((di - 200) % rebalanceFrequency === 0) {
      const scores = []
      for (const sym of validSymbols) {
        const quotes = priceData[sym]
        const matchIdx = quotes.findIndex((q) => q.date.toISOString().slice(0, 10) >= date)
        if (matchIdx < 0 || matchIdx < Math.max(...lookbacks)) continue

        const closesUpToDate = quotes.slice(0, matchIdx + 1)
          .map((q) => q.close)
          .filter((c) => c != null && c > 0)
        if (closesUpToDate.length < Math.max(...lookbacks)) continue

        const momentum = calcMomentum(closesUpToDate, lookbacks)

        const logReturns = []
        for (let j = 1; j < closesUpToDate.length; j++) {
          const r = Math.log(closesUpToDate[j] / closesUpToDate[j - 1])
          if (isFinite(r)) logReturns.push(r)
        }
        const vol = calcRollingVol(logReturns, logReturns.length - 1)
        const price = quotes[matchIdx].close
        scores.push({ symbol: sym, score: momentum - vol, price: price || 0 })
      }

      scores.sort((a, b) => b.score - a.score)

      // Build rank lookup: symbol -> rank (1-based)
      const rankMap = {}
      scores.forEach((s, i) => { rankMap[s.symbol] = i + 1 })

      // Current portfolio value
      const portfolioValue = Object.entries(holdings).reduce((sum, [sym, qty]) => {
        const quotes = priceData[sym]
        const matchIdx = quotes.findIndex((q) => q.date.toISOString().slice(0, 10) >= date)
        const price = matchIdx >= 0 ? quotes[matchIdx].close : 0
        return sum + qty * price
      }, capital)

      if (exitRank && exitRank > 0 && Object.keys(holdings).length > 0) {
        // --- FRR (Find-Remove-Replace) rebalancing ---

        // FIND: Check which held stocks have dropped below exit rank
        const holdSymbols = Object.keys(holdings)
        const keepSymbols = []
        const removeSymbols = []

        for (const sym of holdSymbols) {
          const rank = rankMap[sym]
          if (rank !== undefined && rank <= exitRank) {
            keepSymbols.push(sym)
          } else {
            removeSymbols.push(sym)
          }
        }

        // REMOVE: Sell stocks below exit rank, add proceeds to cash
        let availableCash = capital
        for (const sym of removeSymbols) {
          const qty = holdings[sym]
          const quotes = priceData[sym]
          const matchIdx = quotes.findIndex((q) => q.date.toISOString().slice(0, 10) >= date)
          const price = matchIdx >= 0 ? quotes[matchIdx].close : 0
          availableCash += qty * price
          delete holdings[sym]
        }

        // Track trade outcomes for win/loss stats
        const slotsToFill = topN - keepSymbols.length

        // REPLACE: Fill vacated slots with top-ranked stocks not already held
        const candidates = scores
          .filter(s => !keepSymbols.includes(s.symbol))
          .slice(0, slotsToFill)

        if (candidates.length > 0) {
          const perStock = availableCash / candidates.length
          for (const s of candidates) {
            if (s.price > 0) {
              const qty = Math.floor(perStock / s.price)
              if (qty > 0) {
                holdings[s.symbol] = qty
                availableCash -= qty * s.price
              }
            }
          }
        }

        capital = availableCash
      } else {
        // --- Full replacement rebalancing (original behavior) ---
        const selected = scores.slice(0, topN)

        // Apply regime filter
        let effectiveTopN = selected.length
        if (regimeData && regimeFilter) {
          const trendValue = regimeData[date]
          if (trendValue === -1) {
            const action = regimeFilter.action || "half_portfolio"
            if (action === "half_portfolio") {
              effectiveTopN = Math.max(1, Math.ceil(selected.length / 2))
            } else if (action === "quarter_portfolio") {
              effectiveTopN = Math.max(1, Math.ceil(selected.length / 4))
            } else if (action === "exit_all") {
              effectiveTopN = 0
            }
          }
        }

        const activeSelected = selected.slice(0, effectiveTopN)

        if (activeSelected.length === 0) {
          holdings = {}
          capital = portfolioValue
        } else {
          const perStock = portfolioValue / activeSelected.length
          holdings = {}
          capital = 0

          for (const s of activeSelected) {
            if (s.price > 0) {
              holdings[s.symbol] = Math.floor(perStock / s.price)
              capital += perStock - holdings[s.symbol] * s.price
            }
          }
        }
      }
    }
```

- [x] **Step 2: Test FRR rebalancing**

```bash
# Without FRR (full replacement, original behavior)
curl -X POST http://localhost:3000/api/backtest \
  -H "Content-Type: application/json" \
  -d '{"universe":"nifty50","symbolLimit":10,"topN":5}'

# With FRR (exit rank of 25 — sell if stock drops below rank 25)
curl -X POST http://localhost:3000/api/backtest \
  -H "Content-Type: application/json" \
  -d '{"universe":"nifty50","symbolLimit":10,"topN":5,"exitRank":25}'
```

Verify both return valid results. The FRR version should show different trade counts and potentially lower turnover.

- [x] **Step 3: Commit**

```bash
git add services/backtest.js
git commit -m "feat: add FRR (Find-Remove-Replace) rebalancing with exit rank threshold"
```

---

### Task 3: Benchmark Data Fetching + Equity Curve Overlay

**Why third:** This extends the backtest response to include benchmark data alongside the portfolio equity curve. The frontend needs this for the dual-line chart in Task 4.

**Files:**
- Modify: `services/backtest.js`

- [x] **Step 1: Add benchmark equity curve to backtest results**

In `services/backtest.js`, after the price data fetch loop and before the main simulation loop, add benchmark data fetching. Insert this block after `const dateIndex = ...`:

```js
  // Fetch benchmark index data for overlay
  let benchmarkCurve = []
  const benchmarkSymbol = "^NSEI" // NIFTY 50 as default benchmark
  try {
    const yahooFinance = require("yahoo-finance2").default
    const benchResult = await yahooFinance.chart(benchmarkSymbol, {
      period1: "2015-01-01",
      interval: "1d",
      events: "",
      includePrePost: false,
    })
    const benchQuotes = benchResult?.quotes ?? []
    if (benchQuotes.length > 0) {
      // Build a date->close map for the benchmark
      const benchMap = {}
      for (const q of benchQuotes) {
        const d = q.date.toISOString().slice(0, 10)
        if (q.close != null && q.close > 0) benchMap[d] = q.close
      }

      // Find the first benchmark price at or after our start point
      let benchStart = null
      for (let di = 200; di < dateIndex.length; di++) {
        if (benchMap[dateIndex[di]]) {
          benchStart = benchMap[dateIndex[di]]
          break
        }
      }

      if (benchStart) {
        // Normalize benchmark to start at same value as initialCapital
        for (let di = 200; di < dateIndex.length; di++) {
          const date = dateIndex[di]
          const benchClose = benchMap[date]
          if (benchClose) {
            benchmarkCurve.push({
              date,
              value: Math.round((benchClose / benchStart) * initialCapital),
            })
          }
        }
      }
    }
  } catch (e) {
    console.warn(`Benchmark fetch failed: ${e.message}`)
  }
```

- [x] **Step 2: Include benchmark in the result object**

In the result object construction at the end of `run()`, add the benchmark curve. After the `equityCurve` line, add `benchmarkCurve`:

```js
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
    benchmarkCurve: benchmarkCurve.filter((_, i) => i % 5 === 0),
  }
```

- [x] **Step 3: Test benchmark overlay data**

```bash
curl -X POST http://localhost:3000/api/backtest \
  -H "Content-Type: application/json" \
  -d '{"universe":"nifty50","symbolLimit":10,"topN":5}' | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('equityCurve points:', len(d.get('equityCurve', [])))
print('benchmarkCurve points:', len(d.get('benchmarkCurve', [])))
if d.get('benchmarkCurve'):
    print('benchmark first:', d['benchmarkCurve'][0])
    print('benchmark last:', d['benchmarkCurve'][-1])
"
```

Verify `benchmarkCurve` is populated with date/value pairs and is roughly the same length as `equityCurve`.

- [x] **Step 4: Commit**

```bash
git add services/backtest.js
git commit -m "feat: add benchmark index overlay data to backtest results"
```

---

### Task 4: Enhanced Backtest Frontend (Full SigmaScanner Form)

**Why fourth:** With all backend changes complete (regime filter, FRR, benchmark), the frontend can now be built to use them all. The backtest panel is the more complex of the two UIs.

**Files:**
- Rewrite: `frontend/src/components/BacktestPanel.jsx`
- Modify: `frontend/src/api.js`
- Modify: `frontend/src/styles/globals.css`

- [x] **Step 1: Add backtest API methods to `frontend/src/api.js`**

Add these methods to the `api` object in `frontend/src/api.js`:

```js
  backtestDownload: (id) =>
    fetch(`/api/backtests/${id}/download`).then(res => {
      if (!res.ok) throw new Error("Download failed")
      return res.blob()
    }),

  getStrategies: () => request("/api/strategies"),

  score: (params) =>
    request("/api/score", { method: "POST", body: JSON.stringify(params) }),
```

- [x] **Step 2: Rewrite `frontend/src/components/BacktestPanel.jsx`**

Replace the entire file `frontend/src/components/BacktestPanel.jsx` with:

```jsx
import { useState, useEffect } from "react"
import { api } from "../api"
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts"

const REBAL_OPTIONS = [
  { value: 5, label: "Weekly" },
  { value: 21, label: "Monthly" },
  { value: 63, label: "Quarterly" },
  { value: 252, label: "Yearly" },
]

const POSITION_SIZING = [
  { value: "equal", label: "Equal Weightage" },
]

const SAMPLE_STRATEGIES = [
  { name: "6M Perf / 6M Vol", formula: "6 Month Performance / 6 Month Volatility" },
  { name: "12M Momentum", formula: "12 Month Performance" },
  { name: "Risk-Adjusted 3M", formula: "3 Month Performance / 3 Month Volatility" },
  { name: "Multi-Period", formula: "(6 Month Performance + 12 Month Performance) / 6 Month Volatility" },
]

export default function BacktestPanel() {
  // Portfolio Rules
  const [universe, setUniverse] = useState("nifty50")
  const [initialCapital, setInitialCapital] = useState(1000000)
  const [topN, setTopN] = useState(10)
  const [exitRank, setExitRank] = useState(52)
  const [rebalFreq, setRebalFreq] = useState(21)
  const [rebalDay, setRebalDay] = useState(1)
  const [positionSizing, setPositionSizing] = useState("equal")
  const [symbolLimit, setSymbolLimit] = useState(50)

  // Portfolio Settings
  const [strategyName, setStrategyName] = useState("")
  const [startDate, setStartDate] = useState("2018-01-01")
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10))

  // Scoring Console
  const [formula, setFormula] = useState("6 Month Performance / 6 Month Volatility")

  // Regime Filter
  const [regimeEnabled, setRegimeEnabled] = useState(false)
  const [regimePeriod, setRegimePeriod] = useState(10)
  const [regimeMultiplier, setRegimeMultiplier] = useState(3)
  const [regimeAction, setRegimeAction] = useState("half_portfolio")

  // Strategies
  const [strategies, setStrategies] = useState([])
  const [selectedStrategy, setSelectedStrategy] = useState("")

  // Results
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [activeResultTab, setActiveResultTab] = useState("config")

  useEffect(() => {
    api.getStrategies().then(data => {
      setStrategies(data.strategies || [])
    }).catch(() => {})
  }, [])

  function loadStrategy(id) {
    const strat = strategies.find(s => String(s.id) === String(id))
    if (strat) {
      setFormula(strat.formula)
      setStrategyName(strat.name)
      setSelectedStrategy(id)
    }
  }

  function clearForm() {
    setFormula("")
    setStrategyName("")
    setResult(null)
    setError(null)
    setSelectedStrategy("")
    setRegimeEnabled(false)
  }

  async function runBacktest() {
    setLoading(true)
    setError(null)
    try {
      const params = {
        universe,
        symbolLimit: Number(symbolLimit),
        topN: Number(topN),
        rebalanceFrequency: Number(rebalFreq),
        startDate,
        endDate,
        initialCapital: Number(initialCapital),
      }

      if (formula.trim()) {
        params.formula = formula.trim()
      }

      if (exitRank && Number(exitRank) > 0) {
        params.exitRank = Number(exitRank)
      }

      if (regimeEnabled) {
        params.regimeFilter = {
          enabled: true,
          period: Number(regimePeriod),
          multiplier: Number(regimeMultiplier),
          action: regimeAction,
        }
      }

      const data = await api.backtest(params)
      setResult(data)
      setActiveResultTab("result")
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function downloadResults() {
    if (!result) return
    const rows = [
      ["Metric", "Value"],
      ["Universe", result.universe],
      ["Start Date", result.startDate],
      ["End Date", result.endDate],
      ["Initial Capital", result.initialCapital],
      ["Final Value", result.finalValue],
      ["Total Return %", result.totalReturn],
      ["CAGR %", result.cagr],
      ["Sharpe Ratio", result.sharpe],
      ["Max Drawdown %", result.maxDrawdown],
      ["Win Rate %", result.winRate ?? "N/A"],
      ["Avg Winner ROI %", result.avgWinnerROI ?? "N/A"],
      ["Avg Loser ROI %", result.avgLoserROI ?? "N/A"],
      ["Biggest Winner ROI %", result.biggestWinnerROI ?? "N/A"],
      ["Biggest Loser ROI %", result.biggestLoserROI ?? "N/A"],
      ["Risk:Reward", result.riskReward ?? "N/A"],
      ["Avg Trades/Year", result.avgTradesPerYear ?? "N/A"],
    ]
    const csv = rows.map(r => r.join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `backtest-${result.universe}-${result.startDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Merge equity curve and benchmark for dual-line chart
  const chartData = result?.equityCurve?.map((point) => {
    const bench = result.benchmarkCurve?.find(b => b.date === point.date)
    return {
      date: point.date,
      portfolio: point.value,
      benchmark: bench?.value ?? null,
    }
  }) || []

  const metrics = result ? [
    { label: "Invested Capital", value: `₹${(result.initialCapital || 0).toLocaleString()}`, color: "" },
    { label: "Current Capital", value: `₹${(result.finalValue || 0).toLocaleString()}`, color: result.finalValue >= result.initialCapital ? "positive" : "negative" },
    { label: "Total Return", value: `${result.totalReturn}%`, color: result.totalReturn >= 0 ? "positive" : "negative" },
    { label: "CAGR", value: `${result.cagr}%`, color: result.cagr >= 0 ? "positive" : "negative" },
    { label: "Win Rate", value: result.winRate != null ? `${result.winRate}%` : "N/A", color: (result.winRate ?? 0) >= 50 ? "positive" : "negative" },
    { label: "Avg Winners ROI", value: result.avgWinnerROI != null ? `${result.avgWinnerROI}%` : "N/A", color: "positive" },
    { label: "Avg Losers ROI", value: result.avgLoserROI != null ? `${result.avgLoserROI}%` : "N/A", color: "negative" },
    { label: "Biggest Winner", value: result.biggestWinnerROI != null ? `${result.biggestWinnerROI}%` : "N/A", color: "positive" },
    { label: "Biggest Loser", value: result.biggestLoserROI != null ? `${result.biggestLoserROI}%` : "N/A", color: "negative" },
    { label: "Risk:Reward", value: result.riskReward ?? "N/A", color: "" },
    { label: "Max Drawdown", value: `${result.maxDrawdown}%`, color: "negative" },
    { label: "Sharpe Ratio", value: `${result.sharpe}`, color: result.sharpe >= 1 ? "positive" : "" },
  ] : []

  return (
    <div className="panel">
      {/* Portfolio Rules Section */}
      <div className="section-card">
        <h3>Portfolio Rules</h3>
        <div className="controls">
          <div className="control-group">
            <label>Starting Capital</label>
            <input
              type="number"
              value={initialCapital}
              onChange={(e) => setInitialCapital(e.target.value)}
              min="100000"
              step="100000"
              style={{ width: "120px" }}
            />
          </div>
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
            <label>Symbol Limit</label>
            <input type="number" value={symbolLimit} onChange={(e) => setSymbolLimit(e.target.value)} min="5" max="500" />
          </div>
          <div className="control-group">
            <label>Stocks in Portfolio</label>
            <input type="number" value={topN} onChange={(e) => setTopN(e.target.value)} min="1" max="50" />
          </div>
          <div className="control-group">
            <label>Exit Rank</label>
            <input
              type="number"
              value={exitRank}
              onChange={(e) => setExitRank(e.target.value)}
              min="0"
              max="500"
              title="FRR: sell held stock if rank drops below this. 0 = full replacement."
            />
          </div>
          <div className="control-group">
            <label>Rebalance Frequency</label>
            <select value={rebalFreq} onChange={(e) => setRebalFreq(e.target.value)}>
              {REBAL_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="control-group">
            <label>Rebalance Day</label>
            <input type="number" value={rebalDay} onChange={(e) => setRebalDay(e.target.value)} min="1" max="28" />
          </div>
          <div className="control-group">
            <label>Position Sizing</label>
            <select value={positionSizing} onChange={(e) => setPositionSizing(e.target.value)}>
              {POSITION_SIZING.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Regime Filter */}
      <div className="section-card">
        <div className="section-header">
          <h3>Regime Filter</h3>
          <div className="toggle-wrap">
            <input
              type="checkbox"
              checked={regimeEnabled}
              onChange={(e) => setRegimeEnabled(e.target.checked)}
            />
            <label>Enable</label>
          </div>
        </div>
        {regimeEnabled && (
          <div className="controls">
            <div className="control-group">
              <label>Indicator</label>
              <select disabled>
                <option>Supertrend</option>
              </select>
            </div>
            <div className="control-group">
              <label>Period</label>
              <input type="number" value={regimePeriod} onChange={(e) => setRegimePeriod(e.target.value)} min="1" max="50" />
            </div>
            <div className="control-group">
              <label>Multiplier</label>
              <input
                type="number"
                value={regimeMultiplier}
                onChange={(e) => setRegimeMultiplier(e.target.value)}
                min="0.5"
                max="10"
                step="0.5"
                style={{ width: "80px" }}
              />
            </div>
            <div className="control-group">
              <label>Bearish Action</label>
              <select value={regimeAction} onChange={(e) => setRegimeAction(e.target.value)}>
                <option value="half_portfolio">Half Portfolio</option>
                <option value="quarter_portfolio">Quarter Portfolio</option>
                <option value="exit_all">Exit All</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Portfolio Settings */}
      <div className="section-card">
        <h3>Portfolio Settings</h3>
        <div className="controls">
          <div className="control-group">
            <label>Strategy Name</label>
            <input
              type="text"
              className="text-input"
              value={strategyName}
              onChange={(e) => setStrategyName(e.target.value)}
              placeholder="My Strategy"
            />
          </div>
          <div className="control-group">
            <label>Previous Strategy</label>
            <select
              value={selectedStrategy}
              onChange={(e) => loadStrategy(e.target.value)}
              className="strategy-select"
            >
              <option value="">-- Select --</option>
              {strategies.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="control-group">
            <label>Start Date</label>
            <input
              type="date"
              className="date-input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="control-group">
            <label>End Date</label>
            <input
              type="date"
              className="date-input"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Scoring Console */}
      <div className="section-card">
        <h3>Scoring Console</h3>
        <textarea
          className="formula-textarea"
          value={formula}
          onChange={(e) => setFormula(e.target.value)}
          placeholder="e.g. 6 Month Performance / 6 Month Volatility"
          rows={3}
        />
        <div className="controls" style={{ marginTop: "0.75rem" }}>
          <button className="primary" onClick={runBacktest} disabled={loading}>
            {loading ? "Running Backtest..." : "Backtest"}
          </button>
          <button className="secondary" onClick={clearForm}>
            Clear
          </button>
        </div>
      </div>

      {loading && <div className="loading">Running backtest simulation — this may take a few minutes...</div>}
      {error && <div className="error">{error}</div>}

      {/* Results */}
      {result && (
        <>
          {/* Result Tabs */}
          <div className="result-tabs">
            <button
              className={`result-tab ${activeResultTab === "config" ? "active" : ""}`}
              onClick={() => setActiveResultTab("config")}
            >
              Backtest Config
            </button>
            <button
              className={`result-tab ${activeResultTab === "result" ? "active" : ""}`}
              onClick={() => setActiveResultTab("result")}
            >
              Backtest Result
            </button>
          </div>

          {activeResultTab === "result" && (
            <>
              {/* Overall Performance Metrics */}
              <div className="section-card">
                <div className="section-header">
                  <h3>Overall Performance</h3>
                  <button className="download-btn" onClick={downloadResults}>
                    Download CSV
                  </button>
                </div>
                <div className="metrics-grid metrics-grid-dense">
                  {metrics.map((m, i) => (
                    <div key={i} className="metric">
                      <span className="metric-label">{m.label}</span>
                      <span className={`metric-value ${m.color}`}>{m.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Equity Curve with Benchmark */}
              {chartData.length > 0 && (
                <div className="chart-container">
                  <h3 style={{ marginBottom: "0.5rem" }}>Equity Curve</h3>
                  <ResponsiveContainer width="100%" height={350}>
                    <LineChart data={chartData}>
                      <XAxis dataKey="date" tickFormatter={(d) => d.slice(0, 7)} fontSize={11} />
                      <YAxis fontSize={12} tickFormatter={(v) => `${(v / 100000).toFixed(1)}L`} />
                      <Tooltip
                        formatter={(v, name) => [`₹${Number(v).toLocaleString()}`, name === "portfolio" ? "Momentum Portfolio" : "Benchmark (NIFTY)"]}
                        labelFormatter={(d) => d}
                      />
                      <Legend
                        formatter={(value) => value === "portfolio" ? "Momentum Portfolio" : "Benchmark (NIFTY)"}
                      />
                      <Line type="monotone" dataKey="portfolio" stroke="#22c55e" dot={false} strokeWidth={1.5} />
                      <Line type="monotone" dataKey="benchmark" stroke="#f59e0b" dot={false} strokeWidth={1.5} strokeDasharray="4 2" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}

          {activeResultTab === "config" && (
            <div className="section-card">
              <h3>Backtest Configuration</h3>
              <table className="config-table">
                <tbody>
                  <tr><td>Universe</td><td>{result.universe}</td></tr>
                  <tr><td>Period</td><td>{result.startDate} to {result.endDate}</td></tr>
                  <tr><td>Initial Capital</td><td>₹{(result.initialCapital || 0).toLocaleString()}</td></tr>
                  <tr><td>Stocks in Portfolio</td><td>{topN}</td></tr>
                  <tr><td>Exit Rank</td><td>{exitRank || "N/A (full replacement)"}</td></tr>
                  <tr><td>Rebalance Frequency</td><td>{REBAL_OPTIONS.find(o => o.value === Number(rebalFreq))?.label || rebalFreq + "d"}</td></tr>
                  <tr><td>Formula</td><td><code>{formula || "Default (momentum - volatility)"}</code></td></tr>
                  <tr><td>Regime Filter</td><td>{regimeEnabled ? `Supertrend(${regimePeriod}, ${regimeMultiplier}) — ${regimeAction}` : "Disabled"}</td></tr>
                  <tr><td>Symbols Used</td><td>{result.symbolsUsed}</td></tr>
                  <tr><td>Total Rebalances</td><td>{result.rebalances}</td></tr>
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Explore Sample Strategies */}
      <div className="section-card">
        <h3>Explore Custom Backtest</h3>
        <p className="meta" style={{ marginBottom: "0.75rem" }}>Try these preset strategies to get started:</p>
        <div className="sample-strategies">
          {SAMPLE_STRATEGIES.map((s, i) => (
            <button
              key={i}
              className="sample-strategy-btn"
              onClick={() => {
                setFormula(s.formula)
                setStrategyName(s.name)
              }}
            >
              <span className="sample-name">{s.name}</span>
              <span className="sample-formula">{s.formula}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [x] **Step 3: Add new CSS styles to `frontend/src/styles/globals.css`**

Append these styles to the end of `frontend/src/styles/globals.css` (before the `@media` query):

```css
/* --- P1 Additions --- */

.section-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1.25rem;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.section-header h3 { margin-bottom: 0; }

.formula-textarea {
  width: 100%;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.9rem;
  padding: 0.75rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  resize: vertical;
  line-height: 1.6;
}

.formula-textarea:focus {
  border-color: var(--accent);
  outline: none;
}

.formula-textarea::placeholder { color: var(--text-muted); }

input[type="text"].text-input,
input[type="date"].date-input {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.85rem;
  padding: 0.5rem 0.75rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  width: auto;
}

input[type="text"].text-input { width: 160px; }
input[type="date"].date-input { width: 150px; }

input[type="text"]:focus,
input[type="date"]:focus {
  border-color: var(--accent);
  outline: none;
}

select.strategy-select {
  min-width: 160px;
}

button.secondary {
  font-family: 'Outfit', sans-serif;
  font-size: 0.9rem;
  font-weight: 500;
  padding: 0.6rem 1.25rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

button.secondary:hover {
  border-color: var(--text-muted);
  color: var(--text);
}

.download-btn {
  font-family: 'Outfit', sans-serif;
  font-size: 0.8rem;
  font-weight: 500;
  padding: 0.4rem 0.75rem;
  border: 1px solid var(--accent);
  border-radius: 6px;
  background: transparent;
  color: var(--accent);
  cursor: pointer;
  transition: all 0.15s ease;
}

.download-btn:hover {
  background: var(--accent);
  color: var(--bg);
}

.result-tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--border);
}

.result-tab {
  font-family: 'Outfit', sans-serif;
  font-size: 0.85rem;
  padding: 0.6rem 1.25rem;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.result-tab:hover { color: var(--text); }
.result-tab.active { color: var(--accent); border-bottom-color: var(--accent); }

.metrics-grid-dense {
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
}

.config-table {
  width: 100%;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.85rem;
}

.config-table td {
  padding: 0.5rem 1rem;
  border-bottom: 1px solid rgba(45, 58, 79, 0.4);
}

.config-table td:first-child {
  color: var(--text-muted);
  width: 40%;
}

.config-table code {
  background: var(--bg);
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
  font-size: 0.8rem;
}

.sample-strategies {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.75rem;
}

.sample-strategy-btn {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.75rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease;
}

.sample-strategy-btn:hover {
  border-color: var(--accent);
}

.sample-name {
  font-family: 'Outfit', sans-serif;
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--text);
}

.sample-formula {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem 0;
}

.pagination button {
  font-family: 'Outfit', sans-serif;
  font-size: 0.8rem;
  padding: 0.35rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.pagination button:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.pagination button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.pagination button.active {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--bg);
}

.pagination .page-info {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.pagination select {
  font-size: 0.8rem;
  padding: 0.3rem 0.5rem;
  min-width: auto;
  width: auto;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 1.5rem;
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  overflow-y: auto;
}

.modal h3 {
  margin-bottom: 1rem;
}

.modal-close {
  float: right;
  font-size: 1.25rem;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
}

.modal-close:hover { color: var(--text); }

.qty-table {
  width: 100%;
  border-collapse: collapse;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.85rem;
  margin-top: 1rem;
}

.qty-table th, .qty-table td {
  padding: 0.5rem 0.75rem;
  text-align: left;
}

.qty-table th {
  color: var(--text-muted);
  font-weight: 500;
  border-bottom: 1px solid var(--border);
}

.qty-table tr:not(:last-child) td {
  border-bottom: 1px solid rgba(45, 58, 79, 0.4);
}

.sector-badge {
  display: inline-block;
  font-size: 0.7rem;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  background: rgba(34, 197, 94, 0.1);
  color: var(--accent);
  font-family: 'Outfit', sans-serif;
}

.index-badge {
  display: inline-block;
  font-size: 0.65rem;
  padding: 0.1rem 0.4rem;
  border-radius: 3px;
  background: rgba(99, 102, 241, 0.15);
  color: #818cf8;
  font-family: 'JetBrains Mono', monospace;
  text-transform: uppercase;
}

.filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: flex-end;
  padding: 0.75rem 0;
}
```

- [x] **Step 4: Verify backtest panel renders**

```bash
# Terminal 1
cd /Users/hari-11966/Desktop/momentum-quant-saas && npm run dev

# Terminal 2
cd /Users/hari-11966/Desktop/momentum-quant-saas/frontend && npm run dev

# Open http://localhost:5173
# Click "Backtest" tab
# Verify: Portfolio Rules section, Regime Filter section, Portfolio Settings section,
#   Scoring Console textarea, Backtest/Clear buttons, sample strategies grid
```

- [x] **Step 5: Commit**

```bash
git add frontend/src/components/BacktestPanel.jsx frontend/src/api.js frontend/src/styles/globals.css
git commit -m "feat: enhanced backtest UI with regime filter, FRR, benchmark overlay, metric cards"
```

---

### Task 5: EOD Scoring Frontend (Formula Console, Filters, Pagination, Download)

**Why fifth:** The scoring UI depends on the same CSS and API infrastructure added in Task 4. It also shares the formula textarea pattern.

**Files:**
- Create: `frontend/src/components/Pagination.jsx`
- Create: `frontend/src/components/QuantityCalculator.jsx`
- Create: `data/sectors.json`
- Rewrite: `frontend/src/components/ScannerPanel.jsx`
- Modify: `frontend/src/api.js`

- [x] **Step 1: Create sector mapping data at `data/sectors.json`**

Create file at `data/sectors.json`:

```json
{
  "RELIANCE": "Oil & Gas",
  "TCS": "IT",
  "HDFCBANK": "Banking",
  "INFY": "IT",
  "ICICIBANK": "Banking",
  "HINDUNILVR": "FMCG",
  "SBIN": "Banking",
  "BHARTIARTL": "Telecom",
  "ITC": "FMCG",
  "KOTAKBANK": "Banking",
  "LT": "Infrastructure",
  "AXISBANK": "Banking",
  "BAJFINANCE": "Finance",
  "ASIANPAINT": "Consumer",
  "MARUTI": "Automobile",
  "SUNPHARMA": "Pharma",
  "TITAN": "Consumer",
  "TATAMOTORS": "Automobile",
  "WIPRO": "IT",
  "HCLTECH": "IT",
  "TECHM": "IT",
  "ULTRACEMCO": "Cement",
  "NTPC": "Power",
  "POWERGRID": "Power",
  "JSWSTEEL": "Metal",
  "TATASTEEL": "Metal",
  "HINDALCO": "Metal",
  "ADANIPORTS": "Infrastructure",
  "BAJAJFINSV": "Finance",
  "COALINDIA": "Mining",
  "ONGC": "Oil & Gas",
  "BPCL": "Oil & Gas",
  "GRASIM": "Cement",
  "GAIL": "Oil & Gas",
  "DRREDDY": "Pharma",
  "CIPLA": "Pharma",
  "EICHERMOT": "Automobile",
  "HEROMOTOCO": "Automobile",
  "VEDL": "Metal",
  "M&M": "Automobile",
  "INDUSINDBK": "Banking",
  "IOC": "Oil & Gas",
  "HINDPETRO": "Oil & Gas",
  "ZEEL": "Media",
  "UPL": "Chemicals",
  "YESBANK": "Banking",
  "HDFC": "Finance",
  "IBULHSGFIN": "Finance",
  "INFRATEL": "Telecom",
  "_sectors": [
    "Automobile",
    "Banking",
    "Cement",
    "Chemicals",
    "Consumer",
    "Finance",
    "FMCG",
    "Infrastructure",
    "IT",
    "Media",
    "Metal",
    "Mining",
    "Oil & Gas",
    "Pharma",
    "Power",
    "Telecom"
  ]
}
```

- [x] **Step 2: Create `frontend/src/components/Pagination.jsx`**

Create file at `frontend/src/components/Pagination.jsx`:

```jsx
export default function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange }) {
  const totalPages = Math.ceil(total / pageSize)

  function goTo(p) {
    if (p >= 1 && p <= totalPages) onPageChange(p)
  }

  // Build page number buttons — show up to 5 pages centered on current
  const pages = []
  const start = Math.max(1, page - 2)
  const end = Math.min(totalPages, start + 4)
  for (let i = start; i <= end; i++) {
    pages.push(i)
  }

  if (totalPages <= 1 && total <= pageSize) return null

  return (
    <div className="pagination">
      <button onClick={() => goTo(1)} disabled={page === 1}>
        First
      </button>
      <button onClick={() => goTo(page - 1)} disabled={page === 1}>
        Prev
      </button>

      {pages.map(p => (
        <button
          key={p}
          className={p === page ? "active" : ""}
          onClick={() => goTo(p)}
        >
          {p}
        </button>
      ))}

      <button onClick={() => goTo(page + 1)} disabled={page === totalPages}>
        Next
      </button>
      <button onClick={() => goTo(totalPages)} disabled={page === totalPages}>
        Last
      </button>

      <span className="page-info">
        {total} results
      </span>

      <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))}>
        <option value={10}>10/page</option>
        <option value={25}>25/page</option>
        <option value={50}>50/page</option>
      </select>
    </div>
  )
}
```

- [x] **Step 3: Create `frontend/src/components/QuantityCalculator.jsx`**

Create file at `frontend/src/components/QuantityCalculator.jsx`:

```jsx
import { useState, useMemo } from "react"

export default function QuantityCalculator({ scores, onClose }) {
  const [capital, setCapital] = useState(1000000)
  const [method, setMethod] = useState("equal")

  const allocations = useMemo(() => {
    if (!scores || scores.length === 0) return []
    const perStock = capital / scores.length

    return scores.map((s, i) => {
      const price = s.stockPrice || s.price || 0
      const qty = price > 0 ? Math.floor(perStock / price) : 0
      const invested = qty * price
      return {
        rank: i + 1,
        symbol: s.symbol,
        price,
        quantity: qty,
        invested: Math.round(invested),
        weight: ((invested / capital) * 100).toFixed(1),
      }
    })
  }, [scores, capital, method])

  const totalInvested = allocations.reduce((sum, a) => sum + a.invested, 0)
  const cashRemaining = capital - totalInvested

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>x</button>
        <h3>Quantity Calculator</h3>

        <div className="controls">
          <div className="control-group">
            <label>Total Capital</label>
            <input
              type="number"
              value={capital}
              onChange={(e) => setCapital(Number(e.target.value))}
              min="10000"
              step="100000"
              style={{ width: "140px" }}
            />
          </div>
          <div className="control-group">
            <label>Method</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="equal">Equal Weight</option>
            </select>
          </div>
        </div>

        <div className="meta" style={{ margin: "0.75rem 0" }}>
          {scores.length} stocks | ₹{perStockDisplay(capital, scores.length)} per stock
          | Cash remaining: ₹{cashRemaining.toLocaleString()}
        </div>

        <div style={{ maxHeight: "400px", overflowY: "auto" }}>
          <table className="qty-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Symbol</th>
                <th>Price</th>
                <th>Qty</th>
                <th>Invested</th>
                <th>Weight</th>
              </tr>
            </thead>
            <tbody>
              {allocations.map((a) => (
                <tr key={a.symbol}>
                  <td className="rank">{a.rank}</td>
                  <td className="symbol">{a.symbol}</td>
                  <td>₹{a.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                  <td>{a.quantity}</td>
                  <td>₹{a.invested.toLocaleString()}</td>
                  <td>{a.weight}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: "1rem", display: "flex", gap: "0.75rem" }}>
          <button className="primary" onClick={() => downloadQtyCSV(allocations, capital)}>
            Download CSV
          </button>
          <button className="secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function perStockDisplay(capital, count) {
  if (count === 0) return "0"
  return Math.round(capital / count).toLocaleString()
}

function downloadQtyCSV(allocations, capital) {
  const rows = [
    ["Rank", "Symbol", "Price", "Quantity", "Invested", "Weight%"],
    ...allocations.map(a => [a.rank, a.symbol, a.price, a.quantity, a.invested, a.weight]),
    [],
    ["Total Capital", capital],
    ["Total Invested", allocations.reduce((s, a) => s + a.invested, 0)],
    ["Cash Remaining", capital - allocations.reduce((s, a) => s + a.invested, 0)],
  ]
  const csv = rows.map(r => r.join(",")).join("\n")
  const blob = new Blob([csv], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "quantity-allocation.csv"
  a.click()
  URL.revokeObjectURL(url)
}
```

- [x] **Step 4: Add scoring + sector API methods to `frontend/src/api.js`**

Add these methods to the `api` object (if not already added):

```js
  score: (params) =>
    request("/api/score", { method: "POST", body: JSON.stringify(params) }),

  getStrategies: () => request("/api/strategies"),

  getSectors: () =>
    fetch("/data/sectors.json").then(res => res.json()).catch(() => ({})),

  scoreDownload: (scanId) =>
    fetch(`/api/score/${scanId}/download`).then(res => {
      if (!res.ok) throw new Error("Download failed")
      return res.blob()
    }),
```

- [x] **Step 5: Rewrite `frontend/src/components/ScannerPanel.jsx`**

Replace the entire file `frontend/src/components/ScannerPanel.jsx` with:

```jsx
import { useState, useEffect, useMemo } from "react"
import { api } from "../api"
import Pagination from "./Pagination"
import QuantityCalculator from "./QuantityCalculator"

export default function ScannerPanel() {
  // Filters
  const [universe, setUniverse] = useState("nifty500")
  const [sector, setSector] = useState("")
  const [priceMin, setPriceMin] = useState("")
  const [priceMax, setPriceMax] = useState("")
  const [scoreDate, setScoreDate] = useState(new Date().toISOString().slice(0, 10))

  // Formula
  const [formula, setFormula] = useState("6 Month Performance / 6 Month Volatility")
  const [saveFormula, setSaveFormula] = useState(false)
  const [formulaName, setFormulaName] = useState("")

  // Strategies
  const [strategies, setStrategies] = useState([])
  const [selectedStrategy, setSelectedStrategy] = useState("")

  // Sectors
  const [sectors, setSectors] = useState([])
  const [sectorMap, setSectorMap] = useState({})

  // Results
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [allScores, setAllScores] = useState([])
  const [scanMeta, setScanMeta] = useState(null)

  // Pagination
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  // Quantity Calculator
  const [showQtyCalc, setShowQtyCalc] = useState(false)

  useEffect(() => {
    api.getStrategies().then(data => {
      setStrategies(data.strategies || [])
    }).catch(() => {})

    api.getSectors().then(data => {
      setSectorMap(data)
      setSectors(data._sectors || [])
    }).catch(() => {})
  }, [])

  function loadStrategy(id) {
    const strat = strategies.find(s => String(s.id) === String(id))
    if (strat) {
      setFormula(strat.formula)
      setFormulaName(strat.name)
      setSelectedStrategy(id)
    }
  }

  function clearForm() {
    setFormula("")
    setFormulaName("")
    setAllScores([])
    setScanMeta(null)
    setError(null)
    setSelectedStrategy("")
    setSector("")
    setPriceMin("")
    setPriceMax("")
    setPage(1)
  }

  async function runScore() {
    setLoading(true)
    setError(null)
    try {
      const params = {
        universe,
        formula: formula.trim(),
        date: scoreDate,
      }

      if (sector) params.sector = sector
      if (priceMin) params.priceMin = Number(priceMin)
      if (priceMax) params.priceMax = Number(priceMax)

      const data = await api.score(params)

      // Enrich with sector data
      const enriched = (data.scores || []).map((s, i) => ({
        ...s,
        rank: i + 1,
        sector: sectorMap[s.symbol] || "—",
        indexBadge: universe.replace("nifty", "N"),
      }))

      setAllScores(enriched)
      setScanMeta({
        scanId: data.scanId,
        symbolsScanned: data.symbolsScanned || enriched.length,
        totalInUniverse: data.totalInUniverse || "—",
      })
      setPage(1)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // Client-side pagination of results
  const paginatedScores = useMemo(() => {
    const start = (page - 1) * pageSize
    return allScores.slice(start, start + pageSize)
  }, [allScores, page, pageSize])

  function downloadCSV() {
    if (allScores.length === 0) return
    const rows = [
      ["Rank", "Index", "Symbol", "Sector", "Stock Price", "Score"],
      ...allScores.map(s => [
        s.rank,
        s.indexBadge,
        s.symbol,
        s.sector,
        s.stockPrice ?? s.price ?? "",
        s.score?.toFixed(4) ?? "",
      ])
    ]
    const csv = rows.map(r => r.join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `score-${universe}-${scoreDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="panel">
      {/* Filters */}
      <div className="section-card">
        <h3>EOD Scoring</h3>
        <div className="filter-row">
          <div className="control-group">
            <label>Index / Universe</label>
            <select value={universe} onChange={(e) => setUniverse(e.target.value)}>
              <option value="nifty50">NIFTY 50</option>
              <option value="nifty100">NIFTY 100</option>
              <option value="nifty200">NIFTY 200</option>
              <option value="nifty250">NIFTY 250</option>
              <option value="nifty500">NIFTY 500</option>
            </select>
          </div>
          <div className="control-group">
            <label>Sector</label>
            <select value={sector} onChange={(e) => setSector(e.target.value)} style={{ minWidth: "140px" }}>
              <option value="">All Sectors</option>
              {sectors.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="control-group">
            <label>Min Price</label>
            <input
              type="number"
              value={priceMin}
              onChange={(e) => setPriceMin(e.target.value)}
              placeholder="0"
              min="0"
            />
          </div>
          <div className="control-group">
            <label>Max Price</label>
            <input
              type="number"
              value={priceMax}
              onChange={(e) => setPriceMax(e.target.value)}
              placeholder="No limit"
              min="0"
            />
          </div>
          <div className="control-group">
            <label>Date</label>
            <input
              type="date"
              className="date-input"
              value={scoreDate}
              onChange={(e) => setScoreDate(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Scoring Console */}
      <div className="section-card">
        <h3>Scoring Console</h3>
        <textarea
          className="formula-textarea"
          value={formula}
          onChange={(e) => setFormula(e.target.value)}
          placeholder="e.g. 6 Month Performance / 6 Month Volatility"
          rows={3}
        />

        <div className="controls" style={{ marginTop: "0.75rem" }}>
          <div className="toggle-wrap">
            <input
              type="checkbox"
              checked={saveFormula}
              onChange={(e) => setSaveFormula(e.target.checked)}
            />
            <label>Save Formula</label>
          </div>
          {saveFormula && (
            <div className="control-group">
              <label>Name</label>
              <input
                type="text"
                className="text-input"
                value={formulaName}
                onChange={(e) => setFormulaName(e.target.value)}
                placeholder="Strategy name"
              />
            </div>
          )}
          <div className="control-group">
            <label>Previous Strategy</label>
            <select
              value={selectedStrategy}
              onChange={(e) => loadStrategy(e.target.value)}
              className="strategy-select"
            >
              <option value="">-- Select --</option>
              {strategies.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="controls" style={{ marginTop: "0.75rem" }}>
          <button className="primary" onClick={runScore} disabled={loading}>
            {loading ? "Scoring..." : "Score"}
          </button>
          <button className="secondary" onClick={clearForm}>
            Clear
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {/* Results */}
      {allScores.length > 0 && (
        <div className="section-card">
          <div className="section-header">
            <div>
              <h3>Results</h3>
              {scanMeta && (
                <span className="meta">
                  Scanned {scanMeta.symbolsScanned}/{scanMeta.totalInUniverse} symbols
                  {scanMeta.scanId && ` | Scan #${scanMeta.scanId}`}
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button className="download-btn" onClick={downloadCSV}>
                Download CSV
              </button>
              <button className="download-btn" onClick={() => setShowQtyCalc(true)}>
                Quantity Calculator
              </button>
            </div>
          </div>

          <table className="results-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Index</th>
                <th>Symbol</th>
                <th>Sector</th>
                <th>Stock Price</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {paginatedScores.map((row) => (
                <tr key={row.symbol}>
                  <td className="rank">{row.rank}</td>
                  <td><span className="index-badge">{row.indexBadge}</span></td>
                  <td className="symbol">{row.symbol}</td>
                  <td><span className="sector-badge">{row.sector}</span></td>
                  <td>
                    {row.stockPrice != null
                      ? `₹${Number(row.stockPrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                      : row.price != null
                        ? `₹${Number(row.price).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                        : "—"}
                  </td>
                  <td className={`score ${(row.score ?? 0) >= 0 ? "positive" : "negative"}`}>
                    {row.score?.toFixed(4) ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <Pagination
            page={page}
            pageSize={pageSize}
            total={allScores.length}
            onPageChange={setPage}
            onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
          />
        </div>
      )}

      {/* Quantity Calculator Modal */}
      {showQtyCalc && (
        <QuantityCalculator
          scores={allScores}
          onClose={() => setShowQtyCalc(false)}
        />
      )}
    </div>
  )
}
```

- [x] **Step 6: Serve sectors.json via Express static**

The file at `data/sectors.json` needs to be accessible from the frontend. Add a static route in `server.js`. After the existing `app.use(express.static("public"))` line, add:

```js
app.use("/data", express.static("data"))
```

However, this also exposes the DB file. Instead, create a dedicated endpoint. Add to `server.js`:

```js
app.get("/api/sectors", handle(async (req, res) => {
  const fs = require("fs")
  const path = require("path")
  const file = path.join(__dirname, "data", "sectors.json")
  if (!fs.existsSync(file)) return res.json({})
  const data = JSON.parse(fs.readFileSync(file))
  res.json(data)
}))
```

Then update the `api.js` method to use this endpoint instead:

```js
  getSectors: () => request("/api/sectors"),
```

- [x] **Step 7: Verify scoring panel renders**

```bash
# Both terminals running
# Open http://localhost:5173
# Click "Scanner" tab
# Verify: EOD Scoring header, filter row (universe, sector, price range, date),
#   Scoring Console textarea, Save Formula checkbox, Previous Strategy dropdown,
#   Score/Clear buttons
# Enter formula "6 Month Performance / 6 Month Volatility" and click Score
# Verify: Results table with Rank, Index badge, Symbol, Sector, Stock Price, Score columns
# Verify: Pagination controls below table
# Verify: Download CSV button works
# Verify: Quantity Calculator button opens modal
```

- [x] **Step 8: Commit**

```bash
git add data/sectors.json \
  frontend/src/components/ScannerPanel.jsx \
  frontend/src/components/Pagination.jsx \
  frontend/src/components/QuantityCalculator.jsx \
  frontend/src/api.js \
  server.js
git commit -m "feat: EOD scoring UI with formula console, sector filter, pagination, qty calculator"
```

---

### Task 6: CSV Download Endpoints

**Why sixth:** The frontend already has download buttons wired up (from Tasks 4 and 5). This task adds the proper server-side CSV generation endpoints.

**Files:**
- Modify: `server.js`

- [x] **Step 1: Add CSV download endpoint for score results**

Add to `server.js` before `app.listen()`:

```js
app.get("/api/score/:scanId/download", handle(async (req, res) => {
  const scan = db.prepare("SELECT * FROM scan_results WHERE id = ?").get(req.params.scanId)
  if (!scan) return res.status(404).json({ error: "Scan not found" })

  const scores = db.prepare(
    "SELECT rank, symbol, score, momentum, volatility FROM scan_scores WHERE scan_id = ? ORDER BY rank"
  ).all(scan.id)

  const header = "Rank,Symbol,Score,Momentum,Volatility\n"
  const rows = scores.map(s =>
    `${s.rank},${s.symbol},${s.score.toFixed(4)},${s.momentum.toFixed(4)},${s.volatility.toFixed(4)}`
  ).join("\n")

  res.setHeader("Content-Type", "text/csv")
  res.setHeader("Content-Disposition", `attachment; filename="score-${scan.id}-${scan.universe}.csv"`)
  res.send(header + rows)
}))
```

- [x] **Step 2: Add CSV download endpoint for backtest results**

Add to `server.js` before `app.listen()`:

```js
app.get("/api/backtests/:id/download", handle(async (req, res) => {
  const bt = db.prepare("SELECT * FROM backtest_results WHERE id = ?").get(req.params.id)
  if (!bt) return res.status(404).json({ error: "Backtest not found" })

  const result = JSON.parse(bt.result_json)

  // Performance summary CSV
  const lines = [
    "Metric,Value",
    `Universe,${result.universe}`,
    `Start Date,${result.startDate}`,
    `End Date,${result.endDate}`,
    `Initial Capital,${result.initialCapital}`,
    `Final Value,${result.finalValue}`,
    `Total Return %,${result.totalReturn}`,
    `CAGR %,${result.cagr}`,
    `Sharpe Ratio,${result.sharpe}`,
    `Max Drawdown %,${result.maxDrawdown}`,
    `Symbols Used,${result.symbolsUsed}`,
    `Rebalances,${result.rebalances}`,
    "",
    "Date,Portfolio Value,Benchmark Value",
  ]

  const benchMap = {}
  if (result.benchmarkCurve) {
    for (const b of result.benchmarkCurve) {
      benchMap[b.date] = b.value
    }
  }

  if (result.equityCurve) {
    for (const point of result.equityCurve) {
      const benchVal = benchMap[point.date] ?? ""
      lines.push(`${point.date},${point.value},${benchVal}`)
    }
  }

  res.setHeader("Content-Type", "text/csv")
  res.setHeader("Content-Disposition", `attachment; filename="backtest-${bt.id}-${result.universe}.csv"`)
  res.send(lines.join("\n"))
}))
```

- [x] **Step 3: Test CSV downloads**

```bash
# Test score download (use an existing scan ID from the database)
curl -s "http://localhost:3000/api/scans?limit=1" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if d.get('scans'):
    print('Scan ID:', d['scans'][0]['id'])
"

# Then download it:
curl -s "http://localhost:3000/api/score/1/download" -o /tmp/test-score.csv
head /tmp/test-score.csv

# Test backtest download
curl -s "http://localhost:3000/api/backtests" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if d.get('results'):
    print('Backtest ID:', d['results'][0]['id'])
"

curl -s "http://localhost:3000/api/backtests/1/download" -o /tmp/test-backtest.csv
head /tmp/test-backtest.csv
```

- [x] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat: add CSV download endpoints for score results and backtest results"
```

---

### Task 7: Quantity Calculator Component (already created in Task 5, verify integration)

**Why last:** The QuantityCalculator was already created and wired in Task 5. This task verifies the full integration and handles any edge cases.

**Files:**
- Verify: `frontend/src/components/QuantityCalculator.jsx` (created in Task 5)
- Modify: `frontend/src/components/ScannerPanel.jsx` (if needed)
- Modify: `frontend/src/components/BacktestPanel.jsx` (add qty calculator button to backtest results)

- [x] **Step 1: Add Quantity Calculator to BacktestPanel results**

In `frontend/src/components/BacktestPanel.jsx`, add the QuantityCalculator import at the top:

```jsx
import QuantityCalculator from "./QuantityCalculator"
```

Add state for the modal, after the existing state declarations:

```jsx
  const [showQtyCalc, setShowQtyCalc] = useState(false)
```

In the result display section, after the Download CSV button in the "Overall Performance" section header, add:

```jsx
<button className="download-btn" onClick={() => setShowQtyCalc(true)}>
  Quantity Calculator
</button>
```

At the very end of the component JSX, before the closing `</div>` of the panel, add:

```jsx
      {showQtyCalc && result && (
        <QuantityCalculator
          scores={result.equityCurve ? [] : []}
          onClose={() => setShowQtyCalc(false)}
        />
      )}
```

Note: The backtest doesn't return individual stock scores with prices in the current response. To make the Quantity Calculator useful here, the backtest endpoint would need to also return the final portfolio holdings with current prices. For now, this button is present but the full integration requires the backtest to return `holdings` in its response. This is a known limitation — the calculator works fully on the scoring panel where individual stock prices are available.

- [x] **Step 2: Verify Quantity Calculator on Scanner panel**

```bash
# Open http://localhost:5173
# Run a score on Scanner tab
# Click "Quantity Calculator" button
# Verify: Modal opens with capital input, method dropdown
# Verify: Table shows rank, symbol, price, quantity, invested amount, weight%
# Change capital to 500000 — quantities should update
# Click "Download CSV" in the modal — verify CSV downloads
# Click "Close" or click overlay — modal closes
```

- [x] **Step 3: Update CLAUDE.md with P1 architecture notes**

Add the following to the "Service Modules" section in `CLAUDE.md`:

```markdown
- **`services/indicators.js`** — Technical indicators. Currently implements Supertrend (ATR-based trend-following) for regime filtering in backtests.
```

Add to the API Endpoints table:

```markdown
| `GET /api/score/:scanId/download` | `server.js` | CSV download of score results |
| `GET /api/backtests/:id/download` | `server.js` | CSV download of backtest results |
| `GET /api/sectors` | reads `data/sectors.json` | Symbol-to-sector mapping |
```

Add to the Frontend section:

```markdown
New P1 components: Pagination (reusable), QuantityCalculator (modal). ScannerPanel rewritten as full EOD scoring UI with formula console, sector filter, price range, pagination. BacktestPanel rewritten with portfolio rules, regime filter, FRR exit rank, benchmark overlay chart, 11+ metric cards, sample strategies.
```

- [x] **Step 4: Final integration test**

```bash
# Terminal 1: npm run dev
# Terminal 2: cd frontend && npm run dev
# Open http://localhost:5173

# Test 1: Scanner tab — enter formula, set universe to nifty50, click Score
# Test 2: Verify pagination (10/25/50 per page toggle)
# Test 3: Download CSV from score results
# Test 4: Open Quantity Calculator, change capital, verify quantities
# Test 5: Backtest tab — set params, enable regime filter, set exit rank, click Backtest
# Test 6: Verify dual-line equity curve (green portfolio + orange benchmark)
# Test 7: Toggle between "Backtest Config" and "Backtest Result" tabs
# Test 8: Download backtest CSV
# Test 9: Click sample strategy cards — formula should populate
```

- [x] **Step 5: Commit**

```bash
git add frontend/src/components/BacktestPanel.jsx CLAUDE.md
git commit -m "feat: integrate quantity calculator in backtest, update CLAUDE.md for P1"
```

---

## Summary of API Changes

| Endpoint | Method | Status | Description |
|---|---|---|---|
| `POST /api/backtest` | POST | MODIFIED | Now accepts `exitRank`, `regimeFilter`, returns `benchmarkCurve` |
| `GET /api/score/:scanId/download` | GET | NEW | CSV download of scoring results |
| `GET /api/backtests/:id/download` | GET | NEW | CSV download of backtest performance + equity curve |
| `GET /api/sectors` | GET | NEW | Returns symbol-to-sector mapping |

## Summary of Backtest Params (after P1)

```json
{
  "universe": "nifty50",
  "symbolLimit": 50,
  "topN": 10,
  "rebalanceFrequency": 21,
  "startDate": "2018-01-01",
  "endDate": "2026-06-07",
  "initialCapital": 1000000,
  "lookbacks": [21, 63, 126, 189],
  "formula": "6 Month Performance / 6 Month Volatility",
  "exitRank": 52,
  "regimeFilter": {
    "enabled": true,
    "period": 10,
    "multiplier": 3,
    "action": "half_portfolio"
  }
}
```

---

## Implementation Status — Completed 2026-06-07

**Status: DONE. All 33 tasks complete. Build passes. Server runs.**

### Deviations from plan

| Plan spec | Actual implementation | Reason |
|---|---|---|
| `QuantityCalculator` in BacktestPanel | Removed from BacktestPanel; only in ScannerPanel | Backtest response has no per-stock prices; button would always show empty modal |
| Sector filter sent as server param | Applied client-side after enrichment with `sectorMap` | `scoring.js` has no sector concept; sectors are frontend-only from `data/sectors.json` |
| `pageSize` server-side pagination for scoring | Frontend sends `pageSize: 1000` to get all results, paginates client-side | `scoring.js` defaulted to `pageSize=10`; getting all results and paginating client-side is cleaner |
| `data/sectors.json` served via `/data` static route | Served via dedicated `GET /api/sectors` endpoint | Static `/data` route would also expose the SQLite DB file |
| CLAUDE.md update in Task 7 | Not done | Out of scope per instructions |

### Bugs found and fixed during implementation

**During initial P1 implementation:**
1. `ScannerPanel.jsx` — duplicate `export default function` (old body left in file) → removed stale body
2. `BacktestPanel.jsx` — duplicate `export default function` (old body left in file) → removed stale body
3. `ScannerPanel.jsx` — `data.scores || data.results` — `scoring.js` never returns `scores` → removed dead `data.scores ||` branch

**During line-by-line audit (pass 1):**
4. `backtest.js` — regime filter: `highs/lows/closes` filtered for nulls separately from `dates`, causing index misalignment → fixed by filtering entire quote records together (`cleanQuotes`)
5. `BacktestPanel.jsx` — benchmark lookup was O(n²): `benchmarkCurve.find()` inside `.map()` → replaced with `useMemo` Map
6. `server.js` CSV download — `result.initialCapital || result.investedCapital` wrong field order (`initialCapital` is never set on backtest result) → swapped to `result.investedCapital || result.initialCapital`

**During full edge case audit (pass 2):**
7. `backtest.js` — CAGR explosion: very short date range (< 6 months) → `years ≈ 0.004` → trillion-percent CAGR → fixed: `years >= 0.5` guard
8. `backtest.js` — negative `rebalances` count when `dateIndex.length < 200` → fixed: `Math.max(0, ...)`
9. `backtest.js` — `null` `initialCapital`/`topN`/`symbolLimit`/`rebalanceFrequency` from empty form fields: `Number('') = NaN → JSON → null → destructuring default skipped → Infinity metrics` → fixed: `safeCapital`, `safeTopN`, `safeRebalFreq`, `safeSymbolLimit` guards at top of `run()`
10. `optimizer.js` — same null/NaN issue for `symbolLimit` → fixed: `safeSymbolLimit` guard

### Final file state

```
services/indicators.js      NEW  — Supertrend + ATR
services/backtest.js         MOD  — FRR, regime filter, benchmark overlay, input sanitization
services/optimizer.js        MOD  — safeSymbolLimit guard
server.js                    MOD  — /api/sectors, /api/score/:id/download, /api/backtests/:id/download
data/sectors.json            NEW  — 100 symbols × 18 sectors
frontend/src/api.js          MOD  — getSectors, scoreDownload, backtestDownload
frontend/src/styles/globals.css  MOD  — P1 CSS (section-card, formula-textarea, pagination, modal, etc.)
frontend/src/components/ScannerPanel.jsx      REWRITE
frontend/src/components/BacktestPanel.jsx     REWRITE
frontend/src/components/Pagination.jsx        NEW
frontend/src/components/QuantityCalculator.jsx  NEW
public/assets/index-4f7e4111.js  REBUILT
public/assets/index-7a17372a.css  REBUILT
```
