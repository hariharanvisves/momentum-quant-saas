# P2: Portfolio Manager, SIP Calculator, Intraday Scoring & Extras

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add portfolio tracking, SIP calculator, monthly P&L heatmap, drawdown comparison chart, intraday scoring, preset backtests, basic JWT auth, and uncorrelated asset toggle to complete SigmaScanner feature parity.

**Architecture:** Portfolio manager adds two new DB tables (`portfolios`, `portfolio_holdings`) and a new service `services/portfolio.js` with CRUD + performance computation. SIP calculator is pure frontend math — no backend. Monthly heatmap and drawdown chart extend the existing backtest service response with `monthlyReturns` and `drawdownCurve` arrays. Intraday scoring adds a new service `services/intraday.js` that uses yahoo-finance2's chart API with sub-daily intervals. Auth adds `services/auth.js` with JWT middleware, `users` and `sessions` tables, and an `AuthContext` provider on the frontend. Uncorrelated asset toggle extends backtest params to optionally invest freed capital during bearish regime periods.

**Tech Stack:** Node.js 18+, Express, better-sqlite3, yahoo-finance2, kiteconnect, jsonwebtoken, bcryptjs, Vite, React 18, Recharts

**Assumes P0 + P1 complete:** Full scoring engine with formula parser, factor library, strategy CRUD, enhanced backtest with 11 metrics, regime filter (Supertrend), FRR rebalancing, benchmark overlay, CSV download, pagination, quantity calculator, and SigmaScanner-style frontend for EOD Scoring and Backtest.

---

## File Structure (new and modified files only)

```
momentum-quant-saas/
├── server.js                              # MODIFY: add portfolio, auth, intraday routes
├── db.js                                  # MODIFY: add portfolios, portfolio_holdings, users, sessions tables
├── services/
│   ├── backtest.js                        # MODIFY: add monthlyReturns, drawdownCurve, uncorrelated asset logic
│   ├── portfolio.js                       # NEW: portfolio CRUD + performance
│   ├── intraday.js                        # NEW: intraday scoring service
│   └── auth.js                            # NEW: JWT auth + password hashing
├── middleware/
│   └── requireAuth.js                     # NEW: JWT verification middleware
├── data/
│   └── presets.json                       # NEW: preset backtest strategies
├── frontend/src/
│   ├── App.jsx                            # MODIFY: add new tabs, auth context, protected routes
│   ├── api.js                             # MODIFY: add portfolio, auth, intraday API methods
│   ├── contexts/
│   │   └── AuthContext.jsx                # NEW: auth state provider
│   ├── components/
│   │   ├── Layout.jsx                     # MODIFY: add sidebar items for new tabs
│   │   ├── BacktestPanel.jsx              # MODIFY: add heatmap, drawdown chart, uncorrelated toggle, preset cards
│   │   ├── PortfolioManager.jsx           # NEW: portfolio list + detail view
│   │   ├── PortfolioDetail.jsx            # NEW: holdings table, P&L, allocation chart
│   │   ├── SipCalculator.jsx              # NEW: compound growth calculator
│   │   ├── HeatmapTable.jsx              # NEW: year x month P&L grid
│   │   ├── DrawdownChart.jsx              # NEW: dual-line drawdown comparison
│   │   ├── IntradayScoring.jsx            # NEW: intraday factor scoring
│   │   ├── PresetCards.jsx                # NEW: preset backtest strategy grid
│   │   ├── LoginPage.jsx                  # NEW: login form
│   │   └── RegisterPage.jsx               # NEW: registration form
│   └── styles/
│       └── globals.css                    # MODIFY: add heatmap, portfolio, auth styles
```

---

### Task 1: Portfolio Manager — DB Schema + API + Frontend

**Files:**
- Modify: `db.js`
- Create: `services/portfolio.js`
- Modify: `server.js`
- Create: `frontend/src/components/PortfolioManager.jsx`
- Create: `frontend/src/components/PortfolioDetail.jsx`
- Modify: `frontend/src/api.js`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/Layout.jsx`
- Modify: `frontend/src/styles/globals.css`

- [x] **Step 1: Add portfolio tables to `db.js`**

Add after the existing `CREATE TABLE IF NOT EXISTS orders` block, inside the same `db.exec()` call:

```js
  CREATE TABLE IF NOT EXISTS portfolios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    universe TEXT NOT NULL DEFAULT 'nifty500',
    strategy_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    config_json TEXT DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS portfolio_holdings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    portfolio_id INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    entry_price REAL NOT NULL DEFAULT 0,
    entry_date TEXT NOT NULL DEFAULT (date('now')),
    current_price REAL DEFAULT 0,
    current_value REAL DEFAULT 0,
    pnl REAL DEFAULT 0,
    pnl_pct REAL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_portfolio_holdings_portfolio_id ON portfolio_holdings(portfolio_id);
```

- [x] **Step 2: Create `services/portfolio.js`**

Create file at `services/portfolio.js`:

```js
const db = require("../db")
const { fetchChart } = require("./yahoo")

const MAX_PORTFOLIOS = 5

function list() {
  return db.prepare(`
    SELECT p.*, COUNT(h.id) as holding_count
    FROM portfolios p
    LEFT JOIN portfolio_holdings h ON h.portfolio_id = p.id
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `).all()
}

function get(id) {
  const portfolio = db.prepare("SELECT * FROM portfolios WHERE id = ?").get(id)
  if (!portfolio) return null
  const holdings = db.prepare(
    "SELECT * FROM portfolio_holdings WHERE portfolio_id = ? ORDER BY symbol"
  ).all(id)
  return { ...portfolio, holdings }
}

function create({ name, universe, strategy_id, config_json }) {
  const count = db.prepare("SELECT COUNT(*) as cnt FROM portfolios").get().cnt
  if (count >= MAX_PORTFOLIOS) {
    throw new Error(`Portfolio limit reached (max ${MAX_PORTFOLIOS}). Upgrade plan to create more.`)
  }
  const result = db.prepare(`
    INSERT INTO portfolios (name, universe, strategy_id, config_json)
    VALUES (?, ?, ?, ?)
  `).run(name, universe || "nifty500", strategy_id || null, config_json || "{}")
  return get(result.lastInsertRowid)
}

function update(id, fields) {
  const portfolio = db.prepare("SELECT * FROM portfolios WHERE id = ?").get(id)
  if (!portfolio) throw new Error("Portfolio not found")
  const name = fields.name || portfolio.name
  const universe = fields.universe || portfolio.universe
  const config_json = fields.config_json || portfolio.config_json
  db.prepare("UPDATE portfolios SET name = ?, universe = ?, config_json = ? WHERE id = ?")
    .run(name, universe, config_json, id)
  return get(id)
}

function remove(id) {
  const portfolio = db.prepare("SELECT * FROM portfolios WHERE id = ?").get(id)
  if (!portfolio) throw new Error("Portfolio not found")
  db.prepare("DELETE FROM portfolio_holdings WHERE portfolio_id = ?").run(id)
  db.prepare("DELETE FROM portfolios WHERE id = ?").run(id)
  return { deleted: true, id }
}

function addHolding(portfolioId, { symbol, quantity, entry_price, entry_date }) {
  const portfolio = db.prepare("SELECT * FROM portfolios WHERE id = ?").get(portfolioId)
  if (!portfolio) throw new Error("Portfolio not found")
  const existing = db.prepare(
    "SELECT * FROM portfolio_holdings WHERE portfolio_id = ? AND symbol = ?"
  ).get(portfolioId, symbol)
  if (existing) {
    const totalQty = existing.quantity + quantity
    const avgPrice = ((existing.entry_price * existing.quantity) + (entry_price * quantity)) / totalQty
    db.prepare(
      "UPDATE portfolio_holdings SET quantity = ?, entry_price = ? WHERE id = ?"
    ).run(totalQty, avgPrice, existing.id)
    return db.prepare("SELECT * FROM portfolio_holdings WHERE id = ?").get(existing.id)
  }
  const result = db.prepare(`
    INSERT INTO portfolio_holdings (portfolio_id, symbol, quantity, entry_price, entry_date)
    VALUES (?, ?, ?, ?, ?)
  `).run(portfolioId, symbol, quantity, entry_price, entry_date || new Date().toISOString().slice(0, 10))
  return db.prepare("SELECT * FROM portfolio_holdings WHERE id = ?").get(result.lastInsertRowid)
}

function removeHolding(portfolioId, holdingId) {
  const holding = db.prepare(
    "SELECT * FROM portfolio_holdings WHERE id = ? AND portfolio_id = ?"
  ).get(holdingId, portfolioId)
  if (!holding) throw new Error("Holding not found")
  db.prepare("DELETE FROM portfolio_holdings WHERE id = ?").run(holdingId)
  return { deleted: true, id: holdingId }
}

async function refreshPrices(portfolioId) {
  const holdings = db.prepare(
    "SELECT * FROM portfolio_holdings WHERE portfolio_id = ?"
  ).all(portfolioId)
  const updateStmt = db.prepare(`
    UPDATE portfolio_holdings
    SET current_price = ?, current_value = ?, pnl = ?, pnl_pct = ?
    WHERE id = ?
  `)
  const updates = db.transaction(() => {
    for (const h of holdings) {
      try {
        const chart = fetchChart.__lastQuote?.[h.symbol]
        const price = chart || h.entry_price
        const currentValue = price * h.quantity
        const investedValue = h.entry_price * h.quantity
        const pnl = currentValue - investedValue
        const pnlPct = investedValue > 0 ? (pnl / investedValue) * 100 : 0
        updateStmt.run(price, currentValue, pnl, pnlPct, h.id)
      } catch (e) {
        console.warn(`Price refresh skip ${h.symbol}: ${e.message}`)
      }
    }
  })
  updates()
  return get(portfolioId)
}

function getPerformance(portfolioId) {
  const portfolio = get(portfolioId)
  if (!portfolio) throw new Error("Portfolio not found")
  const holdings = portfolio.holdings || []
  const totalInvested = holdings.reduce((sum, h) => sum + (h.entry_price * h.quantity), 0)
  const totalCurrent = holdings.reduce((sum, h) => sum + (h.current_value || h.entry_price * h.quantity), 0)
  const totalPnl = totalCurrent - totalInvested
  const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0
  const allocation = holdings.map((h) => {
    const value = h.current_value || h.entry_price * h.quantity
    return {
      symbol: h.symbol,
      value,
      percentage: totalCurrent > 0 ? (value / totalCurrent) * 100 : 0,
    }
  })
  return {
    portfolioId,
    name: portfolio.name,
    totalInvested: Math.round(totalInvested),
    totalCurrent: Math.round(totalCurrent),
    totalPnl: Math.round(totalPnl),
    totalPnlPct: +totalPnlPct.toFixed(2),
    holdingCount: holdings.length,
    allocation,
    holdings: holdings.map((h) => ({
      ...h,
      investedValue: Math.round(h.entry_price * h.quantity),
    })),
  }
}

function createFromScoring(name, universe, scoringResults, capitalPerStock = 50000) {
  const portfolio = create({ name, universe, config_json: JSON.stringify({ source: "scoring", capitalPerStock }) })
  for (const stock of scoringResults) {
    if (stock.price && stock.price > 0) {
      const quantity = Math.floor(capitalPerStock / stock.price)
      if (quantity > 0) {
        addHolding(portfolio.id, {
          symbol: stock.symbol,
          quantity,
          entry_price: stock.price,
          entry_date: new Date().toISOString().slice(0, 10),
        })
      }
    }
  }
  return get(portfolio.id)
}

module.exports = { list, get, create, update, remove, addHolding, removeHolding, refreshPrices, getPerformance, createFromScoring }
```

- [x] **Step 3: Add portfolio routes to `server.js`**

Add at the top with other requires:

```js
const portfolio = require("./services/portfolio")
```

Add before `app.listen()`:

```js
// --- Portfolio routes ---
app.get("/api/portfolios", handle(async (req, res) => {
  res.json({ portfolios: portfolio.list() })
}))

app.get("/api/portfolios/:id", handle(async (req, res) => {
  const p = portfolio.get(Number(req.params.id))
  if (!p) return res.status(404).json({ error: "Portfolio not found" })
  res.json(p)
}))

app.post("/api/portfolios", handle(async (req, res) => {
  const p = portfolio.create(req.body)
  res.status(201).json(p)
}))

app.put("/api/portfolios/:id", handle(async (req, res) => {
  const p = portfolio.update(Number(req.params.id), req.body)
  res.json(p)
}))

app.delete("/api/portfolios/:id", handle(async (req, res) => {
  const result = portfolio.remove(Number(req.params.id))
  res.json(result)
}))

app.post("/api/portfolios/:id/holdings", handle(async (req, res) => {
  const holding = portfolio.addHolding(Number(req.params.id), req.body)
  res.status(201).json(holding)
}))

app.delete("/api/portfolios/:id/holdings/:holdingId", handle(async (req, res) => {
  const result = portfolio.removeHolding(Number(req.params.id), Number(req.params.holdingId))
  res.json(result)
}))

app.get("/api/portfolios/:id/performance", handle(async (req, res) => {
  const perf = portfolio.getPerformance(Number(req.params.id))
  res.json(perf)
}))

app.post("/api/portfolios/from-scoring", handle(async (req, res) => {
  const { name, universe, results, capitalPerStock } = req.body
  const p = portfolio.createFromScoring(name, universe, results, capitalPerStock)
  res.status(201).json(p)
}))
```

- [x] **Step 4: Add portfolio API methods to `frontend/src/api.js`**

Add to the `api` object:

```js
  // Portfolio
  getPortfolios: () => request("/api/portfolios"),
  getPortfolio: (id) => request(`/api/portfolios/${id}`),
  createPortfolio: (params) =>
    request("/api/portfolios", { method: "POST", body: JSON.stringify(params) }),
  updatePortfolio: (id, params) =>
    request(`/api/portfolios/${id}`, { method: "PUT", body: JSON.stringify(params) }),
  deletePortfolio: (id) =>
    request(`/api/portfolios/${id}`, { method: "DELETE" }),
  addHolding: (portfolioId, params) =>
    request(`/api/portfolios/${portfolioId}/holdings`, { method: "POST", body: JSON.stringify(params) }),
  removeHolding: (portfolioId, holdingId) =>
    request(`/api/portfolios/${portfolioId}/holdings/${holdingId}`, { method: "DELETE" }),
  getPortfolioPerformance: (id) => request(`/api/portfolios/${id}/performance`),
  createPortfolioFromScoring: (params) =>
    request("/api/portfolios/from-scoring", { method: "POST", body: JSON.stringify(params) }),
```

- [x] **Step 5: Create `frontend/src/components/PortfolioManager.jsx`**

```jsx
import { useState, useEffect } from "react"
import { api } from "../api"
import PortfolioDetail from "./PortfolioDetail"

export default function PortfolioManager() {
  const [portfolios, setPortfolios] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState("")
  const [newUniverse, setNewUniverse] = useState("nifty500")

  useEffect(() => { loadPortfolios() }, [])

  async function loadPortfolios() {
    setLoading(true)
    try {
      const data = await api.getPortfolios()
      setPortfolios(data.portfolios || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return
    try {
      const p = await api.createPortfolio({ name: newName, universe: newUniverse })
      setPortfolios((prev) => [p, ...prev])
      setShowCreate(false)
      setNewName("")
      setSelected(p.id)
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleDelete(id) {
    if (!confirm("Delete this portfolio and all holdings?")) return
    try {
      await api.deletePortfolio(id)
      setPortfolios((prev) => prev.filter((p) => p.id !== id))
      if (selected === id) setSelected(null)
    } catch (e) {
      setError(e.message)
    }
  }

  if (selected) {
    return (
      <PortfolioDetail
        portfolioId={selected}
        onBack={() => { setSelected(null); loadPortfolios() }}
      />
    )
  }

  return (
    <div className="panel">
      <div className="controls">
        <h3 style={{ flex: 1 }}>My Portfolios</h3>
        <button className="primary" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? "Cancel" : "+ New Portfolio"}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {showCreate && (
        <div className="create-portfolio-form">
          <div className="controls">
            <div className="control-group">
              <label>Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="My Momentum Portfolio"
                style={{ width: 220, fontFamily: "Outfit, sans-serif" }}
              />
            </div>
            <div className="control-group">
              <label>Universe</label>
              <select value={newUniverse} onChange={(e) => setNewUniverse(e.target.value)}>
                <option value="nifty50">NIFTY 50</option>
                <option value="nifty100">NIFTY 100</option>
                <option value="nifty200">NIFTY 200</option>
                <option value="nifty500">NIFTY 500</option>
              </select>
            </div>
            <button className="primary" onClick={handleCreate}>Create</button>
          </div>
        </div>
      )}

      {loading && <div className="loading">Loading portfolios...</div>}

      {!loading && portfolios.length === 0 && (
        <div className="empty">No portfolios yet. Create one to start tracking.</div>
      )}

      {portfolios.length > 0 && (
        <div className="portfolio-grid">
          {portfolios.map((p) => (
            <div key={p.id} className="portfolio-card" onClick={() => setSelected(p.id)}>
              <div className="portfolio-card-header">
                <span className="portfolio-name">{p.name}</span>
                <button
                  className="delete-btn"
                  onClick={(e) => { e.stopPropagation(); handleDelete(p.id) }}
                  title="Delete portfolio"
                >
                  x
                </button>
              </div>
              <div className="portfolio-card-meta">
                <span>{p.universe?.toUpperCase()}</span>
                <span>{p.holding_count || 0} holdings</span>
              </div>
              <div className="portfolio-card-date">
                Created {p.created_at?.slice(0, 10)}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="meta">{portfolios.length}/5 portfolios used</p>
    </div>
  )
}
```

- [x] **Step 6: Create `frontend/src/components/PortfolioDetail.jsx`**

```jsx
import { useState, useEffect } from "react"
import { api } from "../api"
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts"

const COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#06b6d4", "#84cc16"]

export default function PortfolioDetail({ portfolioId, onBack }) {
  const [perf, setPerf] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ symbol: "", quantity: "", entry_price: "", entry_date: "" })

  useEffect(() => { loadPerformance() }, [portfolioId])

  async function loadPerformance() {
    setLoading(true)
    try {
      const data = await api.getPortfolioPerformance(portfolioId)
      setPerf(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleAddHolding() {
    if (!addForm.symbol || !addForm.quantity || !addForm.entry_price) return
    try {
      await api.addHolding(portfolioId, {
        symbol: addForm.symbol.toUpperCase(),
        quantity: Number(addForm.quantity),
        entry_price: Number(addForm.entry_price),
        entry_date: addForm.entry_date || new Date().toISOString().slice(0, 10),
      })
      setAddForm({ symbol: "", quantity: "", entry_price: "", entry_date: "" })
      setShowAdd(false)
      loadPerformance()
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleRemoveHolding(holdingId) {
    if (!confirm("Remove this holding?")) return
    try {
      await api.removeHolding(portfolioId, holdingId)
      loadPerformance()
    } catch (e) {
      setError(e.message)
    }
  }

  if (loading) return <div className="loading">Loading portfolio...</div>
  if (error) return <div className="error">{error}</div>
  if (!perf) return null

  const pieData = (perf.allocation || []).filter((a) => a.value > 0)

  return (
    <div className="panel">
      <div className="controls">
        <button className="primary" onClick={onBack} style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)" }}>
          Back
        </button>
        <h3 style={{ flex: 1, marginBottom: 0 }}>{perf.name}</h3>
        <button className="primary" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? "Cancel" : "+ Add Holding"}
        </button>
      </div>

      <div className="metrics-grid">
        <div className="metric">
          <span className="metric-label">Total Invested</span>
          <span className="metric-value">{"₹"}{perf.totalInvested?.toLocaleString()}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Current Value</span>
          <span className="metric-value">{"₹"}{perf.totalCurrent?.toLocaleString()}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Total P&L</span>
          <span className={`metric-value ${perf.totalPnl >= 0 ? "positive" : "negative"}`}>
            {perf.totalPnl >= 0 ? "+" : ""}{"₹"}{perf.totalPnl?.toLocaleString()}
          </span>
        </div>
        <div className="metric">
          <span className="metric-label">P&L %</span>
          <span className={`metric-value ${perf.totalPnlPct >= 0 ? "positive" : "negative"}`}>
            {perf.totalPnlPct >= 0 ? "+" : ""}{perf.totalPnlPct}%
          </span>
        </div>
      </div>

      {showAdd && (
        <div className="create-portfolio-form">
          <div className="controls">
            <div className="control-group">
              <label>Symbol</label>
              <input
                type="text"
                value={addForm.symbol}
                onChange={(e) => setAddForm({ ...addForm, symbol: e.target.value })}
                placeholder="RELIANCE"
                style={{ width: 140, fontFamily: "JetBrains Mono, monospace" }}
              />
            </div>
            <div className="control-group">
              <label>Quantity</label>
              <input
                type="number"
                value={addForm.quantity}
                onChange={(e) => setAddForm({ ...addForm, quantity: e.target.value })}
                min="1"
              />
            </div>
            <div className="control-group">
              <label>Entry Price</label>
              <input
                type="number"
                value={addForm.entry_price}
                onChange={(e) => setAddForm({ ...addForm, entry_price: e.target.value })}
                min="0"
                step="0.05"
                style={{ width: 100 }}
              />
            </div>
            <div className="control-group">
              <label>Entry Date</label>
              <input
                type="date"
                value={addForm.entry_date}
                onChange={(e) => setAddForm({ ...addForm, entry_date: e.target.value })}
                style={{ width: 140, fontFamily: "JetBrains Mono, monospace", fontSize: "0.85rem", padding: "0.5rem 0.75rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)" }}
              />
            </div>
            <button className="primary" onClick={handleAddHolding}>Add</button>
          </div>
        </div>
      )}

      {pieData.length > 0 && (
        <div className="chart-container">
          <h3>Allocation</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="symbol"
                cx="50%"
                cy="50%"
                outerRadius={100}
                innerRadius={50}
                label={({ symbol, percentage }) => `${symbol} ${percentage.toFixed(1)}%`}
              >
                {pieData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => `${"₹"}${Math.round(v).toLocaleString()}`} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {perf.holdings && perf.holdings.length > 0 && (
        <div className="results-card">
          <table className="results-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Qty</th>
                <th>Entry</th>
                <th>Current</th>
                <th>Invested</th>
                <th>Value</th>
                <th>P&L</th>
                <th>P&L %</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {perf.holdings.map((h) => (
                <tr key={h.id}>
                  <td className="symbol">{h.symbol}</td>
                  <td>{h.quantity}</td>
                  <td>{"₹"}{h.entry_price?.toFixed(2)}</td>
                  <td>{"₹"}{(h.current_price || h.entry_price)?.toFixed(2)}</td>
                  <td>{"₹"}{h.investedValue?.toLocaleString()}</td>
                  <td>{"₹"}{Math.round(h.current_value || h.investedValue)?.toLocaleString()}</td>
                  <td className={h.pnl >= 0 ? "positive" : "negative"}>
                    {h.pnl >= 0 ? "+" : ""}{"₹"}{Math.round(h.pnl || 0).toLocaleString()}
                  </td>
                  <td className={h.pnl_pct >= 0 ? "positive" : "negative"}>
                    {h.pnl_pct >= 0 ? "+" : ""}{(h.pnl_pct || 0).toFixed(2)}%
                  </td>
                  <td>
                    <button
                      className="delete-btn"
                      onClick={() => handleRemoveHolding(h.id)}
                      title="Remove holding"
                    >
                      x
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(!perf.holdings || perf.holdings.length === 0) && (
        <div className="empty">No holdings yet. Add stocks to track your portfolio.</div>
      )}
    </div>
  )
}
```

- [x] **Step 7: Add portfolio tab to Layout and App**

In `frontend/src/components/Layout.jsx`, add to the `tabs` array:

```js
const tabs = [
  { id: "scanner", label: "Scanner" },
  { id: "backtest", label: "Backtest" },
  { id: "optimizer", label: "Optimizer" },
  { id: "rebalance", label: "Rebalance" },
  { id: "portfolio", label: "Portfolio" },
  { id: "sip", label: "SIP Calculator" },
  { id: "intraday", label: "Intraday" },
]
```

In `frontend/src/App.jsx`, add the import and conditional render:

```jsx
import { useState } from "react"
import Layout from "./components/Layout"
import ScannerPanel from "./components/ScannerPanel"
import BacktestPanel from "./components/BacktestPanel"
import OptimizerPanel from "./components/OptimizerPanel"
import RebalancePanel from "./components/RebalancePanel"
import PortfolioManager from "./components/PortfolioManager"
import SipCalculator from "./components/SipCalculator"
import IntradayScoring from "./components/IntradayScoring"

export default function App() {
  const [tab, setTab] = useState("scanner")

  return (
    <Layout activeTab={tab} onTabChange={setTab}>
      {tab === "scanner" && <ScannerPanel />}
      {tab === "backtest" && <BacktestPanel />}
      {tab === "optimizer" && <OptimizerPanel />}
      {tab === "rebalance" && <RebalancePanel />}
      {tab === "portfolio" && <PortfolioManager />}
      {tab === "sip" && <SipCalculator />}
      {tab === "intraday" && <IntradayScoring />}
    </Layout>
  )
}
```

- [x] **Step 8: Add portfolio CSS to `globals.css`**

Append to `frontend/src/styles/globals.css`:

```css
/* Portfolio styles */
.portfolio-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.portfolio-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1.25rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.portfolio-card:hover {
  border-color: var(--accent);
  transform: translateY(-2px);
}

.portfolio-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.portfolio-name {
  font-weight: 600;
  font-size: 1.05rem;
}

.portfolio-card-meta {
  display: flex;
  gap: 1rem;
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-bottom: 0.25rem;
}

.portfolio-card-date {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.delete-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0.15rem 0.5rem;
  font-size: 0.8rem;
  transition: all 0.15s ease;
}

.delete-btn:hover {
  border-color: var(--danger);
  color: var(--danger);
}

.create-portfolio-form {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1rem;
}

input[type="text"] {
  font-family: 'Outfit', sans-serif;
  font-size: 0.85rem;
  padding: 0.5rem 0.75rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
}

input[type="text"]:hover, input[type="text"]:focus {
  border-color: var(--accent);
  outline: none;
}
```

- [x] **Step 9: Test portfolio CRUD**

```bash
# Create portfolio
curl -X POST http://localhost:3000/api/portfolios \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Momentum","universe":"nifty50"}'

# Add holding
curl -X POST http://localhost:3000/api/portfolios/1/holdings \
  -H "Content-Type: application/json" \
  -d '{"symbol":"RELIANCE","quantity":10,"entry_price":2500}'

# Get performance
curl http://localhost:3000/api/portfolios/1/performance

# List all
curl http://localhost:3000/api/portfolios

# Delete
curl -X DELETE http://localhost:3000/api/portfolios/1
```

- [x] **Step 10: Commit**

```bash
git add db.js services/portfolio.js server.js frontend/src/api.js frontend/src/App.jsx \
  frontend/src/components/Layout.jsx frontend/src/components/PortfolioManager.jsx \
  frontend/src/components/PortfolioDetail.jsx frontend/src/styles/globals.css
git commit -m "feat: portfolio manager with CRUD, holdings tracking, P&L, allocation chart"
```

---

### Task 2: SIP Calculator — Pure Frontend

**Files:**
- Create: `frontend/src/components/SipCalculator.jsx`
- Modify: `frontend/src/styles/globals.css`

No backend needed. All calculations happen client-side.

- [x] **Step 1: Create `frontend/src/components/SipCalculator.jsx`**

```jsx
import { useState, useMemo } from "react"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from "recharts"

export default function SipCalculator() {
  const [startingAmount, setStartingAmount] = useState(100000)
  const [monthlySip, setMonthlySip] = useState(25000)
  const [yearlyIncrement, setYearlyIncrement] = useState(10)
  const [expectedCagr, setExpectedCagr] = useState(15)
  const [years, setYears] = useState(10)

  const result = useMemo(() => {
    const monthlyRate = expectedCagr / 100 / 12
    let totalInvested = startingAmount
    let futureValue = startingAmount
    let currentSip = monthlySip
    const yearlyData = []

    for (let year = 1; year <= years; year++) {
      for (let month = 1; month <= 12; month++) {
        futureValue = (futureValue + currentSip) * (1 + monthlyRate)
        totalInvested += currentSip
      }
      yearlyData.push({
        year: `Y${year}`,
        invested: Math.round(totalInvested),
        value: Math.round(futureValue),
      })
      currentSip = Math.round(currentSip * (1 + yearlyIncrement / 100))
    }

    const totalGains = futureValue - totalInvested

    return {
      totalInvested: Math.round(totalInvested),
      futureValue: Math.round(futureValue),
      totalGains: Math.round(totalGains),
      gainsPct: totalInvested > 0 ? +((totalGains / totalInvested) * 100).toFixed(1) : 0,
      yearlyData,
    }
  }, [startingAmount, monthlySip, yearlyIncrement, expectedCagr, years])

  const donutData = [
    { name: "Invested", value: result.totalInvested },
    { name: "Gains", value: result.totalGains },
  ]
  const DONUT_COLORS = ["#3b82f6", "#22c55e"]

  function formatInr(n) {
    if (n >= 10000000) return `${(n / 10000000).toFixed(2)} Cr`
    if (n >= 100000) return `${(n / 100000).toFixed(2)} L`
    return n.toLocaleString()
  }

  return (
    <div className="panel">
      <div className="controls" style={{ flexWrap: "wrap" }}>
        <div className="control-group">
          <label>Starting Amount</label>
          <input
            type="number"
            value={startingAmount}
            onChange={(e) => setStartingAmount(Number(e.target.value))}
            min="0"
            step="10000"
            style={{ width: 120 }}
          />
        </div>
        <div className="control-group">
          <label>Monthly SIP</label>
          <input
            type="number"
            value={monthlySip}
            onChange={(e) => setMonthlySip(Number(e.target.value))}
            min="0"
            step="5000"
            style={{ width: 100 }}
          />
        </div>
        <div className="control-group">
          <label>Yearly Increment %</label>
          <input
            type="number"
            value={yearlyIncrement}
            onChange={(e) => setYearlyIncrement(Number(e.target.value))}
            min="0"
            max="50"
          />
        </div>
        <div className="control-group">
          <label>Expected CAGR %</label>
          <input
            type="number"
            value={expectedCagr}
            onChange={(e) => setExpectedCagr(Number(e.target.value))}
            min="1"
            max="50"
          />
        </div>
        <div className="control-group">
          <label>Years</label>
          <input
            type="number"
            value={years}
            onChange={(e) => setYears(Number(e.target.value))}
            min="1"
            max="40"
          />
        </div>
      </div>

      <div className="metrics-grid">
        <div className="metric">
          <span className="metric-label">Total Invested</span>
          <span className="metric-value">{"₹"}{formatInr(result.totalInvested)}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Expected Returns</span>
          <span className="metric-value positive">+{"₹"}{formatInr(result.totalGains)}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Total Value</span>
          <span className="metric-value">{"₹"}{formatInr(result.futureValue)}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Gain %</span>
          <span className="metric-value positive">+{result.gainsPct}%</span>
        </div>
      </div>

      <div className="sip-charts">
        <div className="chart-container">
          <h3>Investment vs Value by Year</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={result.yearlyData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
              <XAxis dataKey="year" fontSize={11} />
              <YAxis fontSize={11} tickFormatter={(v) => formatInr(v)} />
              <Tooltip formatter={(v) => `${"₹"}${v.toLocaleString()}`} />
              <Legend />
              <Bar dataKey="invested" name="Invested" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="value" name="Future Value" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-container">
          <h3>Invested vs Gains</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={donutData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                innerRadius={55}
                label={({ name, value }) => `${name}: ${"₹"}${formatInr(value)}`}
              >
                {donutData.map((_, i) => (
                  <Cell key={i} fill={DONUT_COLORS[i]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => `${"₹"}${v.toLocaleString()}`} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
```

- [x] **Step 2: Add SIP CSS to `globals.css`**

Append to `frontend/src/styles/globals.css`:

```css
/* SIP Calculator styles */
.sip-charts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

@media (max-width: 768px) {
  .sip-charts { grid-template-columns: 1fr; }
}
```

- [x] **Step 3: Verify SIP calculator renders and computes**

Open `http://localhost:5173`, click "SIP Calculator" tab. Verify:
- Changing inputs recalculates instantly (no API call)
- Bar chart shows stacked invested vs value per year
- Donut shows invested vs gains split
- Metrics show formatted INR values

- [x] **Step 4: Commit**

```bash
git add frontend/src/components/SipCalculator.jsx frontend/src/styles/globals.css
git commit -m "feat: SIP calculator with compound growth, yearly bar chart, donut chart"
```

---

### Task 3: Monthly P&L Heatmap — Backend Computation + Frontend

**Files:**
- Modify: `services/backtest.js`
- Create: `frontend/src/components/HeatmapTable.jsx`
- Modify: `frontend/src/components/BacktestPanel.jsx`
- Modify: `frontend/src/styles/globals.css`

- [x] **Step 1: Add `monthlyReturns` computation to `services/backtest.js`**

Inside the `run()` function, after the equity curve is built and before the `result` object is assembled, add:

```js
  // --- Compute monthly returns ---
  const monthlyReturns = []
  const monthMap = {}
  for (const point of equityCurve) {
    const ym = point.date.slice(0, 7) // "YYYY-MM"
    if (!monthMap[ym]) monthMap[ym] = { first: point.value, last: point.value }
    monthMap[ym].last = point.value
  }
  const ymKeys = Object.keys(monthMap).sort()
  for (let i = 0; i < ymKeys.length; i++) {
    const ym = ymKeys[i]
    const [year, month] = ym.split("-")
    const startVal = i === 0 ? initialCapital : monthMap[ymKeys[i - 1]].last
    const endVal = monthMap[ym].last
    const ret = startVal > 0 ? ((endVal - startVal) / startVal) * 100 : 0
    const absReturn = endVal - startVal
    monthlyReturns.push({
      year: Number(year),
      month: Number(month),
      returnPct: +ret.toFixed(2),
      absReturn: Math.round(absReturn),
      startValue: Math.round(startVal),
      endValue: Math.round(endVal),
    })
  }
```

Then add `monthlyReturns` to the `result` object:

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
    monthlyReturns,
  }
```

- [x] **Step 2: Create `frontend/src/components/HeatmapTable.jsx`**

```jsx
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function getCellColor(pct) {
  if (pct === null || pct === undefined) return "transparent"
  if (pct >= 8) return "rgba(34, 197, 94, 0.6)"
  if (pct >= 4) return "rgba(34, 197, 94, 0.4)"
  if (pct >= 2) return "rgba(34, 197, 94, 0.25)"
  if (pct >= 0) return "rgba(34, 197, 94, 0.1)"
  if (pct >= -2) return "rgba(239, 68, 68, 0.1)"
  if (pct >= -4) return "rgba(239, 68, 68, 0.25)"
  if (pct >= -8) return "rgba(239, 68, 68, 0.4)"
  return "rgba(239, 68, 68, 0.6)"
}

export default function HeatmapTable({ monthlyReturns }) {
  if (!monthlyReturns || monthlyReturns.length === 0) return null

  const yearSet = new Set(monthlyReturns.map((m) => m.year))
  const years = [...yearSet].sort()

  const lookup = {}
  for (const m of monthlyReturns) {
    lookup[`${m.year}-${m.month}`] = m
  }

  const yearlyTotals = {}
  for (const year of years) {
    const yearEntries = monthlyReturns.filter((m) => m.year === year)
    if (yearEntries.length === 0) continue
    const firstStart = yearEntries[0].startValue
    const lastEnd = yearEntries[yearEntries.length - 1].endValue
    yearlyTotals[year] = firstStart > 0 ? +((lastEnd - firstStart) / firstStart * 100).toFixed(2) : 0
  }

  return (
    <div className="heatmap-container">
      <h3>Monthly P&L Heatmap</h3>
      <div className="heatmap-scroll">
        <table className="heatmap-table">
          <thead>
            <tr>
              <th>Year</th>
              {MONTH_LABELS.map((m) => <th key={m}>{m}</th>)}
              <th>Annual</th>
            </tr>
          </thead>
          <tbody>
            {years.map((year) => (
              <tr key={year}>
                <td className="heatmap-year">{year}</td>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((month) => {
                  const entry = lookup[`${year}-${month}`]
                  if (!entry) return <td key={month} className="heatmap-cell heatmap-empty">-</td>
                  return (
                    <td
                      key={month}
                      className="heatmap-cell"
                      style={{ background: getCellColor(entry.returnPct) }}
                      title={`${MONTH_LABELS[month - 1]} ${year}: ${entry.returnPct}% (${"₹"}${entry.absReturn.toLocaleString()})`}
                    >
                      <span className={entry.returnPct >= 0 ? "positive" : "negative"}>
                        {entry.returnPct >= 0 ? "+" : ""}{entry.returnPct}%
                      </span>
                    </td>
                  )
                })}
                <td
                  className="heatmap-cell heatmap-annual"
                  style={{ background: getCellColor(yearlyTotals[year]) }}
                >
                  <span className={yearlyTotals[year] >= 0 ? "positive" : "negative"}>
                    <strong>{yearlyTotals[year] >= 0 ? "+" : ""}{yearlyTotals[year]}%</strong>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [x] **Step 3: Integrate HeatmapTable into BacktestPanel**

In `frontend/src/components/BacktestPanel.jsx`, add import:

```jsx
import HeatmapTable from "./HeatmapTable"
```

After the equity curve chart section (after the closing `</div>` of `chart-container`), add:

```jsx
      {result.monthlyReturns && (
        <HeatmapTable monthlyReturns={result.monthlyReturns} />
      )}
```

- [x] **Step 4: Add heatmap CSS to `globals.css`**

Append to `frontend/src/styles/globals.css`:

```css
/* Heatmap styles */
.heatmap-container {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1rem;
}

.heatmap-scroll {
  overflow-x: auto;
}

.heatmap-table {
  width: 100%;
  border-collapse: collapse;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  white-space: nowrap;
}

.heatmap-table th {
  padding: 0.4rem 0.5rem;
  color: var(--text-muted);
  font-weight: 500;
  text-align: center;
  border-bottom: 1px solid var(--border);
}

.heatmap-cell {
  padding: 0.4rem 0.5rem;
  text-align: center;
  border: 1px solid rgba(45, 58, 79, 0.3);
  font-variant-numeric: tabular-nums;
  transition: all 0.15s ease;
}

.heatmap-cell:hover {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.heatmap-year {
  font-weight: 600;
  padding: 0.4rem 0.75rem;
  color: var(--text-muted);
}

.heatmap-empty {
  color: var(--text-muted);
  opacity: 0.3;
}

.heatmap-annual {
  font-weight: 600;
  border-left: 2px solid var(--border);
}
```

- [x] **Step 5: Test heatmap**

```bash
curl -X POST http://localhost:3000/api/backtest \
  -H "Content-Type: application/json" \
  -d '{"universe":"nifty50","symbolLimit":10,"topN":5}'
# Verify response includes monthlyReturns array
```

Open frontend, run backtest, verify heatmap grid appears below equity chart.

- [x] **Step 6: Commit**

```bash
git add services/backtest.js frontend/src/components/HeatmapTable.jsx \
  frontend/src/components/BacktestPanel.jsx frontend/src/styles/globals.css
git commit -m "feat: monthly P&L heatmap with color-coded year x month grid"
```

---

### Task 4: Drawdown Comparison Chart — Backend + Frontend

**Files:**
- Modify: `services/backtest.js`
- Create: `frontend/src/components/DrawdownChart.jsx`
- Modify: `frontend/src/components/BacktestPanel.jsx`

- [x] **Step 1: Add drawdown curve computation to `services/backtest.js`**

Inside the `run()` function, after computing `maxDrawdown` and before `dailyReturns`, replace the drawdown loop with one that also builds a curve:

```js
  let peak = 0
  let maxDrawdown = 0
  const drawdownCurve = []
  for (const point of equityCurve) {
    if (point.value > peak) peak = point.value
    const dd = peak > 0 ? ((peak - point.value) / peak) * 100 : 0
    if (dd / 100 > maxDrawdown) maxDrawdown = dd / 100
    drawdownCurve.push({ date: point.date, portfolioDD: +dd.toFixed(2) })
  }
```

If the backtest params include a `benchmark` symbol (used in benchmark overlay from P1), also compute benchmark drawdown. After loading benchmark data (if available), add:

```js
  // If benchmark data exists from P1 benchmark overlay, add benchmarkDD
  if (benchmarkCurve && benchmarkCurve.length > 0) {
    let bmPeak = 0
    const bmDDMap = {}
    for (const bp of benchmarkCurve) {
      if (bp.value > bmPeak) bmPeak = bp.value
      const dd = bmPeak > 0 ? ((bmPeak - bp.value) / bmPeak) * 100 : 0
      bmDDMap[bp.date] = +dd.toFixed(2)
    }
    for (const dp of drawdownCurve) {
      dp.benchmarkDD = bmDDMap[dp.date] ?? null
    }
  }
```

Add `drawdownCurve` to the result object (sampled like equityCurve):

```js
    drawdownCurve: drawdownCurve.filter((_, i) => i % 5 === 0),
```

**If benchmark overlay is not yet implemented from P1**, compute a simple benchmark drawdown using NIFTY 50 index. Add this after the equity curve loop:

```js
  // Compute benchmark (NIFTY 50) drawdown for comparison
  const benchmarkSymbol = params.benchmark || "^NSEI"
  let benchmarkDD = []
  try {
    const yahooFinance = require("yahoo-finance2").default
    const bmChart = await yahooFinance.chart(benchmarkSymbol, {
      period1: startDate,
      period2: endDate,
      interval: "1d",
    })
    const bmQuotes = bmChart?.quotes ?? []
    let bmPeak = 0
    const bmDDMap = {}
    for (const q of bmQuotes) {
      const d = q.date.toISOString().slice(0, 10)
      const close = q.close
      if (close > bmPeak) bmPeak = close
      const dd = bmPeak > 0 ? ((bmPeak - close) / bmPeak) * 100 : 0
      bmDDMap[d] = +dd.toFixed(2)
    }
    for (const dp of drawdownCurve) {
      dp.benchmarkDD = bmDDMap[dp.date] ?? null
    }
  } catch (e) {
    console.warn(`Benchmark drawdown skip: ${e.message}`)
  }
```

- [x] **Step 2: Create `frontend/src/components/DrawdownChart.jsx`**

```jsx
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts"

export default function DrawdownChart({ drawdownCurve }) {
  if (!drawdownCurve || drawdownCurve.length === 0) return null

  const hasBenchmark = drawdownCurve.some((d) => d.benchmarkDD != null)

  return (
    <div className="chart-container">
      <h3>Drawdown Comparison</h3>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={drawdownCurve} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <XAxis dataKey="date" tickFormatter={(d) => d.slice(0, 7)} fontSize={11} />
          <YAxis
            fontSize={11}
            reversed
            tickFormatter={(v) => `-${v}%`}
            domain={[0, "auto"]}
          />
          <Tooltip
            formatter={(v, name) => [
              `-${v.toFixed(2)}%`,
              name === "portfolioDD" ? "Portfolio" : "Benchmark",
            ]}
            labelFormatter={(d) => d}
          />
          <Legend formatter={(v) => (v === "portfolioDD" ? "Portfolio DD" : "Benchmark DD")} />
          <Line
            type="monotone"
            dataKey="portfolioDD"
            stroke="#ef4444"
            dot={false}
            strokeWidth={1.5}
          />
          {hasBenchmark && (
            <Line
              type="monotone"
              dataKey="benchmarkDD"
              stroke="#8b9cb3"
              dot={false}
              strokeWidth={1}
              strokeDasharray="4 2"
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [x] **Step 3: Integrate DrawdownChart into BacktestPanel**

In `frontend/src/components/BacktestPanel.jsx`, add import:

```jsx
import DrawdownChart from "./DrawdownChart"
```

After the equity curve chart section and HeatmapTable, add:

```jsx
      {result.drawdownCurve && (
        <DrawdownChart drawdownCurve={result.drawdownCurve} />
      )}
```

- [x] **Step 4: Test drawdown chart**

```bash
curl -X POST http://localhost:3000/api/backtest \
  -H "Content-Type: application/json" \
  -d '{"universe":"nifty50","symbolLimit":10,"topN":5}'
# Verify response includes drawdownCurve array with portfolioDD (and optionally benchmarkDD)
```

- [x] **Step 5: Commit**

```bash
git add services/backtest.js frontend/src/components/DrawdownChart.jsx \
  frontend/src/components/BacktestPanel.jsx
git commit -m "feat: drawdown comparison chart with portfolio vs benchmark DD overlay"
```

---

### Task 5: Sample Preset Backtests — Seed Data + Frontend Cards

**Files:**
- Create: `data/presets.json`
- Modify: `server.js`
- Create: `frontend/src/components/PresetCards.jsx`
- Modify: `frontend/src/components/BacktestPanel.jsx`
- Modify: `frontend/src/api.js`
- Modify: `frontend/src/styles/globals.css`

- [x] **Step 1: Create `data/presets.json`**

```json
[
  {
    "id": "momentum-classic",
    "name": "Classic Momentum",
    "description": "Multi-lookback momentum minus volatility. The original factor strategy.",
    "universe": "nifty200",
    "topN": 15,
    "rebalanceFrequency": 21,
    "lookbacks": [21, 63, 126, 189],
    "symbolLimit": 50,
    "initialCapital": 1000000
  },
  {
    "id": "aggressive-momentum",
    "name": "Aggressive Momentum",
    "description": "Short lookbacks, frequent rebalancing, concentrated portfolio.",
    "universe": "nifty500",
    "topN": 10,
    "rebalanceFrequency": 10,
    "lookbacks": [10, 21, 42, 63],
    "symbolLimit": 100,
    "initialCapital": 1000000
  },
  {
    "id": "conservative-momentum",
    "name": "Conservative Momentum",
    "description": "Long lookbacks, wider portfolio, less frequent rebalancing.",
    "universe": "nifty100",
    "topN": 20,
    "rebalanceFrequency": 42,
    "lookbacks": [63, 126, 189, 252],
    "symbolLimit": 50,
    "initialCapital": 1000000
  },
  {
    "id": "large-cap-quality",
    "name": "Large Cap Quality",
    "description": "NIFTY 50 only. Low volatility momentum filter for blue chips.",
    "universe": "nifty50",
    "topN": 10,
    "rebalanceFrequency": 21,
    "lookbacks": [63, 126, 189, 252],
    "symbolLimit": 50,
    "initialCapital": 1000000
  },
  {
    "id": "mid-cap-hunter",
    "name": "Mid Cap Hunter",
    "description": "Broad NIFTY 500 scan targeting high-momentum mid-cap names.",
    "universe": "nifty500",
    "topN": 15,
    "rebalanceFrequency": 21,
    "lookbacks": [21, 63, 126, 189],
    "symbolLimit": 200,
    "initialCapital": 1000000
  },
  {
    "id": "weekly-rebal",
    "name": "Weekly Rebalance",
    "description": "Weekly portfolio rotation. Higher turnover, captures short-term trends.",
    "universe": "nifty200",
    "topN": 10,
    "rebalanceFrequency": 5,
    "lookbacks": [10, 21, 42, 63],
    "symbolLimit": 50,
    "initialCapital": 1000000
  }
]
```

- [x] **Step 2: Add presets endpoint to `server.js`**

```js
app.get("/api/presets", handle(async (req, res) => {
  const fs = require("fs")
  const path = require("path")
  const file = path.join(__dirname, "data", "presets.json")
  if (!fs.existsSync(file)) return res.json({ presets: [] })
  const presets = JSON.parse(fs.readFileSync(file, "utf-8"))
  res.json({ presets })
}))
```

- [x] **Step 3: Add presets API method to `frontend/src/api.js`**

Add to the `api` object:

```js
  getPresets: () => request("/api/presets"),
```

- [x] **Step 4: Create `frontend/src/components/PresetCards.jsx`**

```jsx
import { useState, useEffect } from "react"
import { api } from "../api"

export default function PresetCards({ onSelect }) {
  const [presets, setPresets] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getPresets()
      .then((data) => setPresets(data.presets || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading || presets.length === 0) return null

  return (
    <div className="preset-section">
      <h3>Explore Custom Backtests</h3>
      <div className="preset-grid">
        {presets.map((p) => (
          <div key={p.id} className="preset-card" onClick={() => onSelect(p)}>
            <div className="preset-name">{p.name}</div>
            <div className="preset-desc">{p.description}</div>
            <div className="preset-meta">
              <span>{p.universe?.toUpperCase()}</span>
              <span>Top {p.topN}</span>
              <span>{p.rebalanceFrequency}d rebal</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [x] **Step 5: Integrate PresetCards into BacktestPanel**

In `frontend/src/components/BacktestPanel.jsx`, add import:

```jsx
import PresetCards from "./PresetCards"
```

Add a handler function inside the component to fill in form values when a preset is selected:

```jsx
  function handlePresetSelect(preset) {
    setUniverse(preset.universe || "nifty50")
    setSymbolLimit(preset.symbolLimit || 20)
    setTopN(preset.topN || 10)
    setRebalFreq(preset.rebalanceFrequency || 21)
  }
```

Below the controls div and before the error display, add:

```jsx
      {!result && <PresetCards onSelect={handlePresetSelect} />}
```

- [x] **Step 6: Add preset CSS to `globals.css`**

Append to `frontend/src/styles/globals.css`:

```css
/* Preset cards styles */
.preset-section {
  margin-top: 0.5rem;
}

.preset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 0.75rem;
  margin-top: 0.75rem;
}

.preset-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 1rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.preset-card:hover {
  border-color: var(--accent);
  transform: translateY(-1px);
}

.preset-name {
  font-weight: 600;
  font-size: 0.95rem;
  margin-bottom: 0.35rem;
}

.preset-desc {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-bottom: 0.5rem;
  line-height: 1.4;
}

.preset-meta {
  display: flex;
  gap: 0.75rem;
  font-size: 0.7rem;
  color: var(--accent);
  font-family: 'JetBrains Mono', monospace;
}
```

- [x] **Step 7: Test presets**

```bash
curl http://localhost:3000/api/presets
# Verify returns array of 6 preset objects
```

Open frontend, click Backtest tab. Verify preset cards appear below form. Click one and confirm form fields fill in.

- [x] **Step 8: Commit**

```bash
git add data/presets.json server.js frontend/src/api.js \
  frontend/src/components/PresetCards.jsx frontend/src/components/BacktestPanel.jsx \
  frontend/src/styles/globals.css
git commit -m "feat: preset backtest strategies with auto-fill cards"
```

---

### Task 6: Intraday Scoring — Factors + Endpoint + Frontend

**Files:**
- Create: `services/intraday.js`
- Modify: `server.js`
- Create: `frontend/src/components/IntradayScoring.jsx`
- Modify: `frontend/src/api.js`

- [x] **Step 1: Create `services/intraday.js`**

```js
const yahooFinance = require("yahoo-finance2").default
const { delay } = require("./yahoo")
const { loadUniverse } = require("./scanner")

const INTRADAY_INTERVALS = ["1m", "5m", "15m"]

async function fetchIntraday(symbol, interval = "5m") {
  const opts = {
    fetchOptions: {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
      },
    },
  }
  return yahooFinance.chart(symbol + ".NS", {
    period1: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    interval,
    includePrePost: false,
  }, opts)
}

function calcPerformance(closes, minutes) {
  if (closes.length < minutes + 1) return 0
  const current = closes[closes.length - 1]
  const past = closes[closes.length - 1 - minutes]
  if (!past || past <= 0) return 0
  return ((current - past) / past) * 100
}

function calcVolatility(closes, minutes) {
  if (closes.length < minutes + 1) return 0
  const slice = closes.slice(-minutes)
  const logReturns = []
  for (let i = 1; i < slice.length; i++) {
    const r = Math.log(slice[i] / slice[i - 1])
    if (isFinite(r)) logReturns.push(r)
  }
  if (logReturns.length < 2) return 0
  const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length
  const variance = logReturns.reduce((a, r) => a + (r - mean) ** 2, 0) / (logReturns.length - 1)
  return Math.sqrt(variance) * 100
}

async function score(params = {}) {
  const {
    universe = "nifty50",
    limit = 20,
    interval = "5m",
    topN = 10,
    factors = ["perf30", "perf60", "perf90", "vol30", "vol60"],
    formula = null,
  } = params

  const symbols = loadUniverse(universe).slice(0, limit)
  const results = []

  const minuteMap = { "1m": 1, "5m": 5, "15m": 15 }
  const barsPerMinute = 1 / (minuteMap[interval] || 5)

  for (const symbol of symbols) {
    try {
      const chart = await fetchIntraday(symbol, interval)
      const quotes = chart?.quotes ?? []
      if (quotes.length < 100) {
        await delay(1000)
        continue
      }

      const closes = quotes.map((q) => q.close).filter((c) => c != null && c > 0)

      const bars30 = Math.round(30 * barsPerMinute) || 6
      const bars60 = Math.round(60 * barsPerMinute) || 12
      const bars90 = Math.round(90 * barsPerMinute) || 18

      const factorValues = {
        perf30: calcPerformance(closes, bars30),
        perf60: calcPerformance(closes, bars60),
        perf90: calcPerformance(closes, bars90),
        vol30: calcVolatility(closes, bars30),
        vol60: calcVolatility(closes, bars60),
        vol90: calcVolatility(closes, bars90),
        price: closes[closes.length - 1] || 0,
      }

      let score = 0
      if (formula) {
        // Simple formula evaluation: "perf60 - vol30"
        try {
          const safeFormula = formula.replace(/[^a-zA-Z0-9\s+\-*/().]/g, "")
          const fn = new Function(...Object.keys(factorValues), `return ${safeFormula}`)
          score = fn(...Object.values(factorValues))
          if (!isFinite(score)) score = 0
        } catch (e) {
          score = factorValues.perf60 - factorValues.vol30
        }
      } else {
        score = factorValues.perf60 - factorValues.vol30
      }

      results.push({
        symbol,
        score: +score.toFixed(4),
        ...Object.fromEntries(
          Object.entries(factorValues).map(([k, v]) => [k, +v.toFixed(4)])
        ),
      })
    } catch (e) {
      console.warn(`Intraday skip ${symbol}: ${e.message}`)
    }
    await delay(1500)
  }

  results.sort((a, b) => b.score - a.score)

  return {
    results: results.slice(0, topN),
    total: results.length,
    interval,
    universe,
    scoredAt: new Date().toISOString(),
    availableFactors: ["perf30", "perf60", "perf90", "vol30", "vol60", "vol90", "price"],
  }
}

module.exports = { score }
```

- [x] **Step 2: Add intraday route to `server.js`**

Add at top:

```js
const intraday = require("./services/intraday")
```

Add route:

```js
app.post("/api/score/intraday", handle(async (req, res) => {
  const result = await intraday.score(req.body)
  res.json(result)
}))
```

- [x] **Step 3: Add intraday API method to `frontend/src/api.js`**

Add to the `api` object:

```js
  scoreIntraday: (params) =>
    request("/api/score/intraday", { method: "POST", body: JSON.stringify(params) }),
```

- [x] **Step 4: Create `frontend/src/components/IntradayScoring.jsx`**

```jsx
import { useState } from "react"
import { api } from "../api"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts"

const AVAILABLE_FACTORS = ["perf30", "perf60", "perf90", "vol30", "vol60", "vol90", "price"]

export default function IntradayScoring() {
  const [universe, setUniverse] = useState("nifty50")
  const [limit, setLimit] = useState(20)
  const [interval, setInterval_] = useState("5m")
  const [topN, setTopN] = useState(10)
  const [formula, setFormula] = useState("perf60 - vol30")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  async function runScoring() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.scoreIntraday({
        universe,
        limit: Number(limit),
        interval: interval,
        topN: Number(topN),
        formula,
      })
      setResult(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function insertFactor(factor) {
    setFormula((prev) => prev + (prev && !prev.endsWith(" ") ? " " : "") + factor)
  }

  const chartData = result?.results?.map((r) => ({
    symbol: r.symbol,
    score: r.score,
  })) || []

  return (
    <div className="panel">
      <div className="controls" style={{ flexWrap: "wrap" }}>
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
          <label>Limit</label>
          <input type="number" value={limit} onChange={(e) => setLimit(e.target.value)} min="5" max="100" />
        </div>
        <div className="control-group">
          <label>Interval</label>
          <select value={interval} onChange={(e) => setInterval_(e.target.value)}>
            <option value="1m">1 min</option>
            <option value="5m">5 min</option>
            <option value="15m">15 min</option>
          </select>
        </div>
        <div className="control-group">
          <label>Top N</label>
          <input type="number" value={topN} onChange={(e) => setTopN(e.target.value)} min="3" max="30" />
        </div>
        <button className="primary" onClick={runScoring} disabled={loading}>
          {loading ? "Scoring..." : "Score Intraday"}
        </button>
      </div>

      <div className="intraday-formula-section">
        <div className="control-group" style={{ flex: 1 }}>
          <label>Scoring Formula</label>
          <input
            type="text"
            value={formula}
            onChange={(e) => setFormula(e.target.value)}
            placeholder="perf60 - vol30"
            className="formula-input"
            style={{ width: "100%", fontFamily: "JetBrains Mono, monospace" }}
          />
        </div>
        <div className="factor-pills">
          {AVAILABLE_FACTORS.map((f) => (
            <button key={f} className="factor-pill" onClick={() => insertFactor(f)}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {result && (
        <>
          <div className="meta">
            Scored {result.total} symbols at {result.interval} interval
            {" · "}{result.scoredAt?.slice(0, 19)}
          </div>

          {chartData.length > 0 && (
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 40 }}>
                  <XAxis dataKey="symbol" angle={-45} textAnchor="end" fontSize={11} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="score">
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.score >= 0 ? "#22c55e" : "#ef4444"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {result.results && (
            <div className="results-card">
              <table className="results-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Symbol</th>
                    <th>Score</th>
                    <th>30m Perf</th>
                    <th>60m Perf</th>
                    <th>90m Perf</th>
                    <th>30m Vol</th>
                    <th>60m Vol</th>
                    <th>Price</th>
                  </tr>
                </thead>
                <tbody>
                  {result.results.map((r, i) => (
                    <tr key={r.symbol}>
                      <td className="rank">{i + 1}</td>
                      <td className="symbol">{r.symbol}</td>
                      <td className={`score ${r.score >= 0 ? "positive" : "negative"}`}>
                        {r.score.toFixed(4)}
                      </td>
                      <td className={r.perf30 >= 0 ? "positive" : "negative"}>
                        {r.perf30 >= 0 ? "+" : ""}{r.perf30?.toFixed(2)}%
                      </td>
                      <td className={r.perf60 >= 0 ? "positive" : "negative"}>
                        {r.perf60 >= 0 ? "+" : ""}{r.perf60?.toFixed(2)}%
                      </td>
                      <td className={r.perf90 >= 0 ? "positive" : "negative"}>
                        {r.perf90 >= 0 ? "+" : ""}{r.perf90?.toFixed(2)}%
                      </td>
                      <td>{r.vol30?.toFixed(2)}%</td>
                      <td>{r.vol60?.toFixed(2)}%</td>
                      <td>{"₹"}{r.price?.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
```

- [x] **Step 5: Add intraday CSS to `globals.css`**

Append to `frontend/src/styles/globals.css`:

```css
/* Intraday scoring styles */
.intraday-formula-section {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.formula-input {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.9rem;
  padding: 0.6rem 0.75rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--accent);
  width: 100%;
}

.formula-input:focus {
  border-color: var(--accent);
  outline: none;
}

.factor-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.factor-pill {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  padding: 0.25rem 0.6rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 14px;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.factor-pill:hover {
  border-color: var(--accent);
  color: var(--accent);
}
```

- [x] **Step 6: Test intraday scoring**

```bash
curl -X POST http://localhost:3000/api/score/intraday \
  -H "Content-Type: application/json" \
  -d '{"universe":"nifty50","limit":5,"interval":"5m","topN":5}'
# Verify response includes results with perf30, perf60, perf90, vol30, vol60, price
```

- [x] **Step 7: Commit**

```bash
git add services/intraday.js server.js frontend/src/api.js \
  frontend/src/components/IntradayScoring.jsx frontend/src/styles/globals.css
git commit -m "feat: intraday scoring with minute-based performance and volatility factors"
```

---

### Task 7: User Auth — JWT + DB + Middleware + Frontend

**Files:**
- Modify: `db.js`
- Create: `services/auth.js`
- Create: `middleware/requireAuth.js`
- Modify: `server.js`
- Modify: `package.json`
- Create: `frontend/src/contexts/AuthContext.jsx`
- Create: `frontend/src/components/LoginPage.jsx`
- Create: `frontend/src/components/RegisterPage.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/api.js`
- Modify: `frontend/src/styles/globals.css`

- [x] **Step 1: Install dependencies**

```bash
npm install jsonwebtoken bcryptjs
```

- [x] **Step 2: Add users and sessions tables to `db.js`**

Add inside the `db.exec()` block:

```js
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    plan TEXT NOT NULL DEFAULT 'free',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
```

- [x] **Step 3: Create `services/auth.js`**

```js
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const db = require("../db")

const JWT_SECRET = process.env.JWT_SECRET || "momentum-quant-dev-secret-change-in-prod"
const TOKEN_EXPIRY = "7d"
const SALT_ROUNDS = 10

async function register(email, password) {
  if (!email || !password) throw new Error("Email and password required")
  if (password.length < 6) throw new Error("Password must be at least 6 characters")

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase())
  if (existing) throw new Error("Email already registered")

  const hash = await bcrypt.hash(password, SALT_ROUNDS)
  const result = db.prepare(
    "INSERT INTO users (email, password_hash) VALUES (?, ?)"
  ).run(email.toLowerCase(), hash)

  const user = db.prepare("SELECT id, email, plan, created_at FROM users WHERE id = ?")
    .get(result.lastInsertRowid)
  const token = generateToken(user)
  saveSession(user.id, token)

  return { user, token }
}

async function login(email, password) {
  if (!email || !password) throw new Error("Email and password required")

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase())
  if (!user) throw new Error("Invalid email or password")

  const valid = await bcrypt.compare(password, user.password_hash)
  if (!valid) throw new Error("Invalid email or password")

  const token = generateToken({
    id: user.id,
    email: user.email,
    plan: user.plan,
  })
  saveSession(user.id, token)

  return {
    user: { id: user.id, email: user.email, plan: user.plan, created_at: user.created_at },
    token,
  }
}

function generateToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, plan: user.plan },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  )
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET)
  } catch (e) {
    return null
  }
}

function saveSession(userId, token) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  db.prepare("INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)")
    .run(userId, token, expiresAt)
}

function getUser(userId) {
  return db.prepare("SELECT id, email, plan, created_at FROM users WHERE id = ?").get(userId)
}

function invalidateSession(token) {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token)
}

module.exports = { register, login, verifyToken, getUser, invalidateSession, JWT_SECRET }
```

- [x] **Step 4: Create `middleware/requireAuth.js`**

Create directory and file:

```bash
mkdir -p middleware
```

```js
const { verifyToken, getUser } = require("../services/auth")

function requireAuth(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" })
  }

  const token = header.slice(7)
  const payload = verifyToken(token)
  if (!payload) {
    return res.status(401).json({ error: "Invalid or expired token" })
  }

  const user = getUser(payload.userId)
  if (!user) {
    return res.status(401).json({ error: "User not found" })
  }

  req.user = user
  req.token = token
  next()
}

function optionalAuth(req, res, next) {
  const header = req.headers.authorization
  if (header && header.startsWith("Bearer ")) {
    const token = header.slice(7)
    const payload = verifyToken(token)
    if (payload) {
      req.user = getUser(payload.userId)
      req.token = token
    }
  }
  next()
}

module.exports = { requireAuth, optionalAuth }
```

- [x] **Step 5: Add auth routes to `server.js`**

Add imports at top:

```js
const auth = require("./services/auth")
const { requireAuth, optionalAuth } = require("./middleware/requireAuth")
```

Add auth endpoints:

```js
// --- Auth routes ---
app.post("/api/auth/register", handle(async (req, res) => {
  const { email, password } = req.body
  const result = await auth.register(email, password)
  res.status(201).json(result)
}))

app.post("/api/auth/login", handle(async (req, res) => {
  const { email, password } = req.body
  const result = await auth.login(email, password)
  res.json(result)
}))

app.get("/api/auth/me", requireAuth, handle(async (req, res) => {
  res.json({ user: req.user })
}))

app.post("/api/auth/logout", requireAuth, handle(async (req, res) => {
  auth.invalidateSession(req.token)
  res.json({ success: true })
}))
```

Optionally protect the portfolio create route with plan-based gating. Update the existing portfolio create route:

```js
app.post("/api/portfolios", optionalAuth, handle(async (req, res) => {
  const p = portfolio.create(req.body)
  res.status(201).json(p)
}))
```

- [x] **Step 6: Add auth API methods to `frontend/src/api.js`**

Replace the `request` function to support auth tokens:

```js
const BASE = ""

let authToken = localStorage.getItem("authToken") || null

function setAuthToken(token) {
  authToken = token
  if (token) {
    localStorage.setItem("authToken", token)
  } else {
    localStorage.removeItem("authToken")
  }
}

async function request(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...opts.headers }
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`
  }
  const res = await fetch(BASE + path, { ...opts, headers })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || "Request failed")
  return data
}

export const api = {
  setAuthToken,
  getAuthToken: () => authToken,

  // Auth
  register: (email, password) =>
    request("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password }) }),
  login: (email, password) =>
    request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  getMe: () => request("/api/auth/me"),
  logout: () => request("/api/auth/logout", { method: "POST" }),

  // existing methods unchanged below ...
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

  // Portfolio
  getPortfolios: () => request("/api/portfolios"),
  getPortfolio: (id) => request(`/api/portfolios/${id}`),
  createPortfolio: (params) =>
    request("/api/portfolios", { method: "POST", body: JSON.stringify(params) }),
  updatePortfolio: (id, params) =>
    request(`/api/portfolios/${id}`, { method: "PUT", body: JSON.stringify(params) }),
  deletePortfolio: (id) =>
    request(`/api/portfolios/${id}`, { method: "DELETE" }),
  addHolding: (portfolioId, params) =>
    request(`/api/portfolios/${portfolioId}/holdings`, { method: "POST", body: JSON.stringify(params) }),
  removeHolding: (portfolioId, holdingId) =>
    request(`/api/portfolios/${portfolioId}/holdings/${holdingId}`, { method: "DELETE" }),
  getPortfolioPerformance: (id) => request(`/api/portfolios/${id}/performance`),
  createPortfolioFromScoring: (params) =>
    request("/api/portfolios/from-scoring", { method: "POST", body: JSON.stringify(params) }),

  // Presets
  getPresets: () => request("/api/presets"),

  // Intraday
  scoreIntraday: (params) =>
    request("/api/score/intraday", { method: "POST", body: JSON.stringify(params) }),
}
```

- [x] **Step 7: Create `frontend/src/contexts/AuthContext.jsx`**

```jsx
import { createContext, useContext, useState, useEffect } from "react"
import { api } from "../api"

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = api.getAuthToken()
    if (token) {
      api.getMe()
        .then((data) => setUser(data.user))
        .catch(() => {
          api.setAuthToken(null)
        })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  async function login(email, password) {
    const data = await api.login(email, password)
    api.setAuthToken(data.token)
    setUser(data.user)
    return data
  }

  async function register(email, password) {
    const data = await api.register(email, password)
    api.setAuthToken(data.token)
    setUser(data.user)
    return data
  }

  async function logout() {
    try {
      await api.logout()
    } catch (e) {
      // ignore
    }
    api.setAuthToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
```

- [x] **Step 8: Create `frontend/src/components/LoginPage.jsx`**

```jsx
import { useState } from "react"
import { useAuth } from "../contexts/AuthContext"

export default function LoginPage({ onSwitchToRegister }) {
  const { login } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(email, password)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2>Sign In</h2>
        <p className="auth-subtitle">Welcome back to Momentum Quant</p>
        <form onSubmit={handleSubmit}>
          <div className="auth-field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="auth-field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 6 characters"
              required
            />
          </div>
          {error && <div className="error">{error}</div>}
          <button type="submit" className="primary auth-submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
        <p className="auth-switch">
          Don't have an account?{" "}
          <button className="link-btn" onClick={onSwitchToRegister}>Register</button>
        </p>
      </div>
    </div>
  )
}
```

- [x] **Step 9: Create `frontend/src/components/RegisterPage.jsx`**

```jsx
import { useState } from "react"
import { useAuth } from "../contexts/AuthContext"

export default function RegisterPage({ onSwitchToLogin }) {
  const { register } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError("Passwords don't match")
      return
    }
    setLoading(true)
    try {
      await register(email, password)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2>Create Account</h2>
        <p className="auth-subtitle">Start tracking momentum strategies</p>
        <form onSubmit={handleSubmit}>
          <div className="auth-field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="auth-field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 6 characters"
              required
              minLength={6}
            />
          </div>
          <div className="auth-field">
            <label>Confirm Password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat password"
              required
            />
          </div>
          {error && <div className="error">{error}</div>}
          <button type="submit" className="primary auth-submit" disabled={loading}>
            {loading ? "Creating..." : "Create Account"}
          </button>
        </form>
        <p className="auth-switch">
          Already have an account?{" "}
          <button className="link-btn" onClick={onSwitchToLogin}>Sign In</button>
        </p>
      </div>
    </div>
  )
}
```

- [x] **Step 10: Update `frontend/src/App.jsx` with auth**

```jsx
import { useState } from "react"
import { AuthProvider, useAuth } from "./contexts/AuthContext"
import Layout from "./components/Layout"
import ScannerPanel from "./components/ScannerPanel"
import BacktestPanel from "./components/BacktestPanel"
import OptimizerPanel from "./components/OptimizerPanel"
import RebalancePanel from "./components/RebalancePanel"
import PortfolioManager from "./components/PortfolioManager"
import SipCalculator from "./components/SipCalculator"
import IntradayScoring from "./components/IntradayScoring"
import LoginPage from "./components/LoginPage"
import RegisterPage from "./components/RegisterPage"

function AppContent() {
  const { user, loading, logout } = useAuth()
  const [tab, setTab] = useState("scanner")
  const [authMode, setAuthMode] = useState("login")

  if (loading) return <div className="loading">Loading...</div>

  if (!user) {
    if (authMode === "register") {
      return <RegisterPage onSwitchToLogin={() => setAuthMode("login")} />
    }
    return <LoginPage onSwitchToRegister={() => setAuthMode("register")} />
  }

  return (
    <Layout activeTab={tab} onTabChange={setTab} user={user} onLogout={logout}>
      {tab === "scanner" && <ScannerPanel />}
      {tab === "backtest" && <BacktestPanel />}
      {tab === "optimizer" && <OptimizerPanel />}
      {tab === "rebalance" && <RebalancePanel />}
      {tab === "portfolio" && <PortfolioManager />}
      {tab === "sip" && <SipCalculator />}
      {tab === "intraday" && <IntradayScoring />}
    </Layout>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
```

- [x] **Step 11: Update Layout to show user info and logout**

In `frontend/src/components/Layout.jsx`:

```jsx
const tabs = [
  { id: "scanner", label: "Scanner" },
  { id: "backtest", label: "Backtest" },
  { id: "optimizer", label: "Optimizer" },
  { id: "rebalance", label: "Rebalance" },
  { id: "portfolio", label: "Portfolio" },
  { id: "sip", label: "SIP Calculator" },
  { id: "intraday", label: "Intraday" },
]

export default function Layout({ activeTab, onTabChange, user, onLogout, children }) {
  return (
    <div className="app">
      <header>
        <div className="header-row">
          <div>
            <h1>Momentum Quant</h1>
            <p className="subtitle">NIFTY Momentum Scanner & Backtester</p>
          </div>
          {user && (
            <div className="user-info">
              <span className="user-email">{user.email}</span>
              <span className="user-plan">{user.plan}</span>
              <button className="logout-btn" onClick={onLogout}>Logout</button>
            </div>
          )}
        </div>
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

- [x] **Step 12: Add auth CSS to `globals.css`**

Append to `frontend/src/styles/globals.css`:

```css
/* Auth styles */
.auth-page {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 80vh;
}

.auth-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 2.5rem;
  width: 100%;
  max-width: 400px;
}

.auth-card h2 {
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: 0.25rem;
}

.auth-subtitle {
  color: var(--text-muted);
  font-size: 0.9rem;
  margin-bottom: 1.5rem;
}

.auth-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-bottom: 1rem;
}

.auth-field label {
  font-size: 0.75rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.auth-field input {
  font-family: 'Outfit', sans-serif;
  font-size: 0.9rem;
  padding: 0.6rem 0.75rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  width: 100%;
}

.auth-field input:focus {
  border-color: var(--accent);
  outline: none;
}

.auth-submit {
  width: 100%;
  margin-top: 0.5rem;
  padding: 0.75rem;
  font-size: 1rem;
}

.auth-switch {
  text-align: center;
  margin-top: 1.25rem;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.link-btn {
  background: none;
  border: none;
  color: var(--accent);
  cursor: pointer;
  font-family: 'Outfit', sans-serif;
  font-size: 0.85rem;
  text-decoration: underline;
}

.link-btn:hover {
  color: var(--accent-dim);
}

.header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.8rem;
}

.user-email {
  color: var(--text-muted);
}

.user-plan {
  background: var(--accent);
  color: var(--bg);
  padding: 0.15rem 0.5rem;
  border-radius: 10px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
}

.logout-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0.3rem 0.75rem;
  font-family: 'Outfit', sans-serif;
  font-size: 0.8rem;
  transition: all 0.15s ease;
}

.logout-btn:hover {
  border-color: var(--danger);
  color: var(--danger);
}
```

- [x] **Step 13: Add JWT_SECRET to `.env.example`**

Append to `.env.example`:

```env
# Auth
JWT_SECRET=change-this-to-a-random-string
```

- [x] **Step 14: Test auth flow**

```bash
# Register
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test123"}'
# Verify response has user and token

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test123"}'

# Get me (use token from above)
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer <token>"

# Duplicate email
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test123"}'
# Should return error "Email already registered"
```

- [x] **Step 15: Commit**

```bash
git add db.js services/auth.js middleware/requireAuth.js server.js package.json package-lock.json \
  .env.example frontend/src/api.js frontend/src/App.jsx frontend/src/components/Layout.jsx \
  frontend/src/contexts/AuthContext.jsx frontend/src/components/LoginPage.jsx \
  frontend/src/components/RegisterPage.jsx frontend/src/styles/globals.css
git commit -m "feat: JWT auth with register, login, protected routes, plan-based gating"
```

---

### Task 8: Uncorrelated Asset Toggle — Backtest Enhancement

**Files:**
- Modify: `services/backtest.js`
- Modify: `frontend/src/components/BacktestPanel.jsx`

- [x] **Step 1: Add uncorrelated asset logic to `services/backtest.js`**

In the `run()` function, destructure the new param:

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
    uncorrelatedAsset = null,  // { enabled: false, symbol: "GOLDBEES" }
  } = params
```

If P1 regime filter (Supertrend) is implemented and detects a bearish regime, the backtest reduces holdings to half. Extend that logic: when `uncorrelatedAsset.enabled` is true and regime is bearish, allocate the freed capital to the uncorrelated asset.

After the regime check (where holdings are reduced to half), add:

```js
      // --- Uncorrelated asset allocation during bearish regime ---
      if (uncorrelatedAsset?.enabled && isBearish) {
        const altSymbol = uncorrelatedAsset.symbol || "GOLDBEES"
        const altData = priceData[altSymbol]
        if (!altData) {
          // Fetch uncorrelated asset data if not already loaded
          try {
            const altResult = await fetchChart(altSymbol, { period1: "2015-01-01", retries: 3 })
            const altQuotes = altResult?.quotes ?? []
            if (altQuotes.length > 100) {
              priceData[altSymbol] = altQuotes
            }
          } catch (e) {
            console.warn(`Uncorrelated asset fetch skip ${altSymbol}: ${e.message}`)
          }
        }
        if (priceData[altSymbol]) {
          const altQuotes = priceData[altSymbol]
          const altIdx = altQuotes.findIndex((q) => q.date.toISOString().slice(0, 10) >= date)
          if (altIdx >= 0) {
            const altPrice = altQuotes[altIdx].close
            if (altPrice > 0) {
              // Invest freed capital (the half that was removed) into uncorrelated asset
              const freedCapital = portfolioValue / 2
              const altQty = Math.floor(freedCapital / altPrice)
              if (altQty > 0) {
                holdings[altSymbol] = altQty
                capital -= altQty * altPrice
              }
            }
          }
        }
      }
```

**If P1 regime filter is NOT yet implemented**, add a simple regime detection using a broad market SMA cross:

```js
      // Simple regime detection: is NIFTY 50 above its 200-day SMA?
      let isBearish = false
      if (uncorrelatedAsset?.enabled) {
        const niftySymbol = "^NSEI"
        if (!priceData[niftySymbol]) {
          try {
            const niftyChart = await yahooFinance.chart(niftySymbol, {
              period1: "2015-01-01",
              interval: "1d",
            })
            priceData[niftySymbol] = niftyChart?.quotes ?? []
          } catch (e) {
            console.warn(`NIFTY index fetch skip: ${e.message}`)
          }
        }
        if (priceData[niftySymbol]) {
          const niftyQuotes = priceData[niftySymbol]
          const nIdx = niftyQuotes.findIndex((q) => q.date.toISOString().slice(0, 10) >= date)
          if (nIdx >= 200) {
            const closes200 = niftyQuotes.slice(nIdx - 200, nIdx).map((q) => q.close)
            const sma200 = closes200.reduce((a, b) => a + b, 0) / closes200.length
            const currentPrice = niftyQuotes[nIdx].close
            isBearish = currentPrice < sma200
          }
        }
      }

      // During bearish regime, only invest half the portfolio in momentum stocks
      let effectiveTopN = topN
      if (isBearish) {
        effectiveTopN = Math.ceil(topN / 2)
      }
      const selected = scores.slice(0, effectiveTopN)

      const portfolioValue = Object.entries(holdings).reduce((sum, [sym, qty]) => {
        const quotes = priceData[sym]
        const matchIdx = quotes.findIndex((q) => q.date.toISOString().slice(0, 10) >= date)
        const price = matchIdx >= 0 ? quotes[matchIdx].close : 0
        return sum + qty * price
      }, capital)

      const perStock = portfolioValue / (selected.length + (isBearish && uncorrelatedAsset?.enabled ? 1 : 0))
      holdings = {}
      capital = 0

      for (const s of selected) {
        if (s.price > 0) {
          holdings[s.symbol] = Math.floor(perStock / s.price)
          capital += perStock - holdings[s.symbol] * s.price
        }
      }

      // Allocate remaining portion to uncorrelated asset
      if (isBearish && uncorrelatedAsset?.enabled) {
        const altSymbol = uncorrelatedAsset.symbol || "GOLDBEES"
        if (!priceData[altSymbol]) {
          try {
            const altResult = await fetchChart(altSymbol, { period1: "2015-01-01", retries: 3 })
            const altQuotes = altResult?.quotes ?? []
            if (altQuotes.length > 100) priceData[altSymbol] = altQuotes
          } catch (e) {
            console.warn(`Uncorrelated asset skip ${altSymbol}: ${e.message}`)
          }
        }
        if (priceData[altSymbol]) {
          const altQuotes = priceData[altSymbol]
          const altIdx = altQuotes.findIndex((q) => q.date.toISOString().slice(0, 10) >= date)
          if (altIdx >= 0 && altQuotes[altIdx].close > 0) {
            const altPrice = altQuotes[altIdx].close
            const altQty = Math.floor(perStock / altPrice)
            if (altQty > 0) {
              holdings[altSymbol] = altQty
              capital += perStock - altQty * altPrice
            }
          }
        }
      }
```

- [x] **Step 2: Update BacktestPanel with uncorrelated asset toggle**

In `frontend/src/components/BacktestPanel.jsx`, add state:

```jsx
  const [uncorrelatedEnabled, setUncorrelatedEnabled] = useState(false)
  const [uncorrelatedSymbol, setUncorrelatedSymbol] = useState("GOLDBEES")
```

In the `runBacktest` function, add to the params:

```jsx
      const data = await api.backtest({
        universe,
        symbolLimit: Number(symbolLimit),
        topN: Number(topN),
        rebalanceFrequency: Number(rebalFreq),
        uncorrelatedAsset: uncorrelatedEnabled
          ? { enabled: true, symbol: uncorrelatedSymbol }
          : null,
      })
```

After the existing controls, add the toggle UI:

```jsx
        <div className="toggle-wrap">
          <input
            type="checkbox"
            checked={uncorrelatedEnabled}
            onChange={(e) => setUncorrelatedEnabled(e.target.checked)}
          />
          <label>Invest in Uncorrelated Asset</label>
        </div>
        {uncorrelatedEnabled && (
          <div className="control-group">
            <label>Asset Symbol</label>
            <select value={uncorrelatedSymbol} onChange={(e) => setUncorrelatedSymbol(e.target.value)}>
              <option value="GOLDBEES">Gold ETF (GOLDBEES)</option>
              <option value="LIQUIDBEES">Liquid ETF (LIQUIDBEES)</option>
              <option value="CPSEETF">CPSE ETF</option>
              <option value="NIFTYBEES">NIFTY ETF (NIFTYBEES)</option>
            </select>
          </div>
        )}
```

- [x] **Step 3: Test uncorrelated asset backtest**

```bash
curl -X POST http://localhost:3000/api/backtest \
  -H "Content-Type: application/json" \
  -d '{
    "universe":"nifty50",
    "symbolLimit":10,
    "topN":5,
    "uncorrelatedAsset":{"enabled":true,"symbol":"GOLDBEES"}
  }'
# Verify backtest runs without error
# Compare CAGR/Sharpe with same params but uncorrelatedAsset: null
```

- [x] **Step 4: Commit**

```bash
git add services/backtest.js frontend/src/components/BacktestPanel.jsx
git commit -m "feat: invest freed capital in uncorrelated asset (Gold/Liquid ETF) during bearish regime"
```

---

## Dependency Install Summary

```bash
# Backend (run from project root)
npm install jsonwebtoken bcryptjs

# Frontend (no new deps needed — recharts already covers all chart types)
```

## New Environment Variables

Add to `.env`:

```env
JWT_SECRET=your-random-secret-string-here
```

## Endpoint Summary (new routes added by P2)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/portfolios` | optional | List all portfolios |
| GET | `/api/portfolios/:id` | optional | Get portfolio with holdings |
| POST | `/api/portfolios` | optional | Create portfolio (max 5) |
| PUT | `/api/portfolios/:id` | optional | Update portfolio |
| DELETE | `/api/portfolios/:id` | optional | Delete portfolio + holdings |
| POST | `/api/portfolios/:id/holdings` | optional | Add holding to portfolio |
| DELETE | `/api/portfolios/:id/holdings/:hid` | optional | Remove holding |
| GET | `/api/portfolios/:id/performance` | optional | Compute portfolio P&L + allocation |
| POST | `/api/portfolios/from-scoring` | optional | Create portfolio from scoring results |
| GET | `/api/presets` | none | List preset backtest strategies |
| POST | `/api/score/intraday` | none | Run intraday scoring |
| POST | `/api/auth/register` | none | Register new user |
| POST | `/api/auth/login` | none | Login, get JWT |
| GET | `/api/auth/me` | required | Get current user |
| POST | `/api/auth/logout` | required | Invalidate session |

## New DB Tables

```
portfolios: id, name, universe, strategy_id, created_at, config_json
portfolio_holdings: id, portfolio_id, symbol, quantity, entry_price, entry_date, current_price, current_value, pnl, pnl_pct
users: id, email, password_hash, plan, created_at
sessions: id, user_id, token, created_at, expires_at
```
