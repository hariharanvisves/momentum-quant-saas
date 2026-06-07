
require("dotenv").config()
const db = require("./db")
const express = require("express")
const cors = require("cors")
const fs = require("fs")
const path = require("path")
const helmet = require("helmet")

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : ["http://localhost:3000", "http://localhost:5173"]

const app = express()
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true)
    cb(new Error("Not allowed by CORS"))
  },
  credentials: true,
}))
app.use(helmet({ contentSecurityPolicy: false }))
app.use(express.json({ limit: "256kb" }))
app.use(express.static("public"))

const scanner = require("./services/scanner")
const backtest = require("./services/backtest")
const optimizer = require("./services/optimizer")
const kite = require("./services/kite")
const scoring = require("./services/scoring")
const portfolio = require("./services/portfolio")
const intraday = require("./services/intraday")
const auth = require("./services/auth")
const { requireAuth } = require("./middleware/requireAuth")

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString(), uptime: process.uptime() })
})

// Universe validation helper
function getValidUniverses() {
  const universeDir = path.join(__dirname, "data", "universes")
  if (!fs.existsSync(universeDir)) return []
  return fs.readdirSync(universeDir).map(f => f.replace(".json", ""))
}
function validateUniverse(universe, res) {
  const valid = getValidUniverses()
  if (valid.length > 0 && !valid.includes(universe)) {
    res.status(400).json({ error: `Unknown universe. Valid: ${valid.join(", ")}` })
    return false
  }
  return true
}

// Rate limiters — defined before routes so const bindings are available
function makeRateLimiter(max, windowMs) {
  const map = new Map()
  // Prune expired entries every 30 minutes to prevent unbounded memory growth
  setInterval(() => {
    const now = Date.now()
    for (const [key, rec] of map) {
      if (rec.reset < now) map.delete(key)
    }
  }, 30 * 60 * 1000).unref()
  return (req, res, next) => {
    const key = req.ip || "unknown"
    const now = Date.now()
    const rec = map.get(key)
    if (!rec || rec.reset < now) {
      map.set(key, { count: 1, reset: now + windowMs })
      return next()
    }
    rec.count++
    if (rec.count > max) {
      return res.status(429).json({ error: "Too many attempts, please try again later" })
    }
    next()
  }
}
const authRateLimit = makeRateLimiter(10, 15 * 60 * 1000)
const heavyRateLimit = makeRateLimiter(30, 10 * 60 * 1000)

const handle = (fn) => (req, res) => {
  fn(req, res).catch((err) => {
    if (err.name === "FormulaError" || err.message === "formula is required") {
      return res.status(400).json({ error: err.message })
    }
    // Pass through user-facing validation errors (set by appError() in services)
    if (err.status && err.status < 500) {
      return res.status(err.status).json({ error: err.message })
    }
    console.error(err)
    res.status(503).json({ error: "Service unavailable" })
  })
}

app.post("/api/backtest", heavyRateLimit, handle(async (req, res) => {
  const universe = req.body.universe || "nifty500"
  if (!validateUniverse(universe, res)) return
  const result = await backtest.run(req.body)
  res.json(result)
}))

app.get("/api/backtests", handle(async (req, res) => {
  const results = db.prepare(
    "SELECT id, universe, cagr, sharpe, max_drawdown, total_return, ran_at FROM backtest_results ORDER BY ran_at DESC LIMIT 20"
  ).all()
  res.json({ results })
}))

app.get("/api/universes", handle(async (req, res) => {
  const fs = require("fs")
  const path = require("path")
  const dir = path.join(__dirname, "data", "universes")
  const files = fs.existsSync(dir) ? fs.readdirSync(dir) : []
  const universes = files
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(".json", ""))
    .sort()
  res.json({ universes })
}))

app.get("/api/factors", handle(async (req, res) => {
  const { getFactorNames } = require("./services/factors")
  // Return canonical names (title-cased for display) grouped by category
  const names = getFactorNames().map(n =>
    n.replace(/\b\w/g, c => c.toUpperCase())
  ).reverse() // reverse: longest-first → shortest-first for readable order
  res.json({ factors: names })
}))

app.get("/api/scanner", heavyRateLimit, handle(async (req, res) => {
  const universe = req.query.universe || "nifty500"
  if (!validateUniverse(universe, res)) return
  const limit = req.query.limit ? Number(req.query.limit) : null
  const formula = req.query.formula || null
  const config = {}
  if (req.query.topN) config.topN = Number(req.query.topN)
  if (req.query.lookbacks) config.lookbacks = req.query.lookbacks.split(",").map(Number)
  const result = await scanner.scan({ universe, limit, formula, config })
  res.json(result)
}))

app.post("/api/score", heavyRateLimit, handle(async (req, res) => {
  const universe = req.body.universe || "nifty500"
  if (!validateUniverse(universe, res)) return
  const result = await scoring.score(req.body)
  res.json(result)
}))

app.post("/api/optimize", heavyRateLimit, handle(async (req, res) => {
  const universe = req.body.universe || "nifty500"
  if (!validateUniverse(universe, res)) return
  const result = await optimizer.run(req.body)
  res.json(result)
}))

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

app.post("/api/rebalance", requireAuth, heavyRateLimit, handle(async (req, res) => {
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

app.get("/api/scans", handle(async (req, res) => {
  const { universe } = req.query
  const limit = Math.max(1, Math.min(1000, Number(req.query.limit) || 20))
  let query = `SELECT * FROM scan_results`
  const params = []
  if (universe) {
    query += ` WHERE universe = ?`
    params.push(universe)
  }
  query += ` ORDER BY scanned_at DESC LIMIT ?`
  params.push(limit)
  const scans = db.prepare(query).all(...params)
  res.json({ scans })
}))

app.get("/api/scans/:id", handle(async (req, res) => {
  const scan = db.prepare("SELECT * FROM scan_results WHERE id = ?").get(req.params.id)
  if (!scan) return res.status(404).json({ error: "Scan not found" })
  const scores = db.prepare("SELECT * FROM scan_scores WHERE scan_id = ? ORDER BY rank").all(scan.id)
  res.json({ ...scan, scores })
}))

// --- Strategy CRUD ---

app.get("/api/strategies", handle(async (req, res) => {
  const strategies = db.prepare(
    "SELECT * FROM strategies ORDER BY updated_at DESC"
  ).all()
  res.json({ strategies })
}))

app.get("/api/strategies/:id", handle(async (req, res) => {
  const strategy = db.prepare("SELECT * FROM strategies WHERE id = ?").get(req.params.id)
  if (!strategy) return res.status(404).json({ error: "Strategy not found" })
  res.json(strategy)
}))

app.post("/api/strategies", handle(async (req, res) => {
  const { name, formula, description } = req.body
  if (!name || !formula) return res.status(400).json({ error: "name and formula are required" })

  const { parse } = require("./services/formula")
  try {
    const compiled = parse(formula)
    const result = db.prepare(
      "INSERT INTO strategies (name, formula, description) VALUES (?, ?, ?)"
    ).run(name, formula, description || null)
    res.json({
      id: result.lastInsertRowid,
      name,
      formula,
      description: description || null,
      factors: compiled.factors,
    })
  } catch (e) {
    if (e.name === "FormulaError") {
      return res.status(400).json({ error: e.message })
    }
    if (e.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({ error: `Strategy name '${name}' already exists` })
    }
    throw e
  }
}))

app.put("/api/strategies/:id", handle(async (req, res) => {
  const { name, formula, description } = req.body
  const existing = db.prepare("SELECT * FROM strategies WHERE id = ?").get(req.params.id)
  if (!existing) return res.status(404).json({ error: "Strategy not found" })

  const newName = name || existing.name
  const newFormula = formula || existing.formula
  const newDesc = description !== undefined ? description : existing.description

  if (formula) {
    const { parse } = require("./services/formula")
    try {
      parse(formula)
    } catch (e) {
      if (e.name === "FormulaError") {
        return res.status(400).json({ error: e.message })
      }
      throw e
    }
  }

  db.prepare(
    "UPDATE strategies SET name = ?, formula = ?, description = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(newName, newFormula, newDesc, req.params.id)

  res.json({ id: Number(req.params.id), name: newName, formula: newFormula, description: newDesc })
}))

app.delete("/api/strategies/:id", handle(async (req, res) => {
  const result = db.prepare("DELETE FROM strategies WHERE id = ?").run(req.params.id)
  if (result.changes === 0) return res.status(404).json({ error: "Strategy not found" })
  res.json({ deleted: true })
}))

app.get("/api/sectors", handle(async (req, res) => {
  const fs = require("fs")
  const path = require("path")
  const file = path.join(__dirname, "data", "sectors.json")
  if (!fs.existsSync(file)) return res.json({})
  res.json(JSON.parse(fs.readFileSync(file)))
}))

app.get("/api/score/:scanId/download", handle(async (req, res) => {
  const scan = db.prepare("SELECT * FROM scan_results WHERE id = ?").get(req.params.scanId)
  if (!scan) return res.status(404).json({ error: "Scan not found" })
  const scores = db.prepare(
    "SELECT rank, symbol, score, momentum, volatility FROM scan_scores WHERE scan_id = ? ORDER BY rank"
  ).all(scan.id)
  const header = "Rank,Symbol,Score,Momentum,Volatility\n"
  const rows = scores.map(s =>
    `${s.rank},${s.symbol},${Number(s.score).toFixed(4)},${Number(s.momentum).toFixed(4)},${Number(s.volatility).toFixed(4)}`
  ).join("\n")
  res.setHeader("Content-Type", "text/csv")
  res.setHeader("Content-Disposition", `attachment; filename="score-${scan.id}-${scan.universe}.csv"`)
  res.send(header + rows)
}))

app.get("/api/backtests/:id", handle(async (req, res) => {
  const bt = db.prepare("SELECT * FROM backtest_results WHERE id = ?").get(req.params.id)
  if (!bt) return res.status(404).json({ error: "Backtest not found" })
  res.json({ ...bt, result: JSON.parse(bt.result_json) })
}))

app.get("/api/backtests/:id/download", handle(async (req, res) => {
  const bt = db.prepare("SELECT * FROM backtest_results WHERE id = ?").get(req.params.id)
  if (!bt) return res.status(404).json({ error: "Backtest not found" })
  const result = JSON.parse(bt.result_json)
  const lines = [
    "Metric,Value",
    `Universe,${result.universe}`,
    `Start Date,${result.startDate}`,
    `End Date,${result.endDate}`,
    `Initial Capital,${result.investedCapital || result.initialCapital}`,
    `Final Value,${result.finalValue}`,
    `Total Return %,${result.totalReturn}`,
    `CAGR %,${result.cagr}`,
    `Sharpe Ratio,${result.sharpe}`,
    `Max Drawdown %,${result.maxDrawdown}`,
    `Win Rate %,${result.winRate ?? ""}`,
    `Symbols Used,${result.symbolsUsed}`,
    `Rebalances,${result.rebalances}`,
    "",
    "Date,Portfolio Value,Benchmark Value",
  ]
  const benchMap = {}
  if (result.benchmarkCurve) {
    for (const b of result.benchmarkCurve) benchMap[b.date] = b.value
  }
  if (result.equityCurve) {
    for (const p of result.equityCurve) {
      lines.push(`${p.date},${p.value},${benchMap[p.date] ?? ""}`)
    }
  }
  res.setHeader("Content-Type", "text/csv")
  res.setHeader("Content-Disposition", `attachment; filename="backtest-${bt.id}-${result.universe}.csv"`)
  res.send(lines.join("\n"))
}))

// --- Portfolio routes ---

/** Returns the portfolio only if it belongs to userId, or 404 response. */
function getOwnedPortfolio(res, portfolioId, userId) {
  const p = portfolio.get(portfolioId)
  if (!p) { res.status(404).json({ error: "Portfolio not found" }); return null }
  if (p.user_id !== null && p.user_id !== userId) {
    res.status(403).json({ error: "Access denied" }); return null
  }
  return p
}

app.get("/api/portfolios", requireAuth, handle(async (req, res) => {
  res.json({ portfolios: portfolio.list(req.user.id) })
}))

app.get("/api/portfolios/:id", requireAuth, handle(async (req, res) => {
  const p = getOwnedPortfolio(res, Number(req.params.id), req.user.id)
  if (!p) return
  res.json(p)
}))

app.post("/api/portfolios", requireAuth, handle(async (req, res) => {
  const p = portfolio.create(req.body, req.user.id)
  res.status(201).json(p)
}))

app.put("/api/portfolios/:id", requireAuth, handle(async (req, res) => {
  if (!getOwnedPortfolio(res, Number(req.params.id), req.user.id)) return
  const p = portfolio.update(Number(req.params.id), req.body)
  res.json(p)
}))

app.delete("/api/portfolios/:id", requireAuth, handle(async (req, res) => {
  if (!getOwnedPortfolio(res, Number(req.params.id), req.user.id)) return
  const result = portfolio.remove(Number(req.params.id))
  res.json(result)
}))

app.post("/api/portfolios/:id/holdings", requireAuth, handle(async (req, res) => {
  if (!getOwnedPortfolio(res, Number(req.params.id), req.user.id)) return
  const holding = portfolio.addHolding(Number(req.params.id), req.body)
  res.status(201).json(holding)
}))

app.delete("/api/portfolios/:id/holdings/:holdingId", requireAuth, handle(async (req, res) => {
  if (!getOwnedPortfolio(res, Number(req.params.id), req.user.id)) return
  const result = portfolio.removeHolding(Number(req.params.id), Number(req.params.holdingId))
  res.json(result)
}))

app.get("/api/portfolios/:id/performance", requireAuth, handle(async (req, res) => {
  if (!getOwnedPortfolio(res, Number(req.params.id), req.user.id)) return
  const perf = portfolio.getPerformance(Number(req.params.id))
  res.json(perf)
}))

app.post("/api/portfolios/:id/refresh", requireAuth, handle(async (req, res) => {
  if (!getOwnedPortfolio(res, Number(req.params.id), req.user.id)) return
  const updated = await portfolio.refreshPrices(Number(req.params.id))
  const perf = portfolio.getPerformance(Number(req.params.id))
  res.json({ updated, performance: perf })
}))

// --- Presets ---
app.get("/api/presets", handle(async (req, res) => {
  const fs = require("fs")
  const path = require("path")
  const file = path.join(__dirname, "data", "presets.json")
  if (!fs.existsSync(file)) return res.json({ presets: [] })
  const presets = JSON.parse(fs.readFileSync(file, "utf-8"))
  res.json({ presets })
}))

// --- Intraday scoring ---
app.post("/api/score/intraday", handle(async (req, res) => {
  const result = await intraday.score(req.body)
  res.json(result)
}))

// --- Auth routes ---
app.post("/api/auth/register", authRateLimit, handle(async (req, res) => {
  const { email, password } = req.body
  const result = await auth.register(email, password)
  res.status(201).json(result)
}))

app.post("/api/auth/login", authRateLimit, handle(async (req, res) => {
  const { email, password } = req.body
  const result = await auth.login(email, password)
  res.json(result)
}))

app.post("/api/auth/forgot-password", authRateLimit, handle(async (req, res) => {
  const { email } = req.body
  const result = await auth.forgotPassword(email)
  res.json(result)
}))

app.post("/api/auth/reset-password", authRateLimit, handle(async (req, res) => {
  const { token, password } = req.body
  const result = await auth.resetPassword(token, password)
  res.json(result)
}))

app.get("/api/auth/me", requireAuth, handle(async (req, res) => {
  res.json({ user: req.user })
}))

app.post("/api/auth/logout", requireAuth, handle(async (req, res) => {
  auth.invalidateSession(req.token)
  res.json({ success: true })
}))

const PORT = process.env.PORT || 3000

// Global error handler — CORS rejections, malformed JSON bodies, and any unhandled
// errors that escape route handlers. Must be defined as a 4-arg function.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  // Guard: if response headers already sent (e.g. client disconnected), do nothing
  if (res.headersSent) return

  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({ error: "Origin not allowed" })
  }
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON in request body" })
  }
  if (err.type === "entity.too.large") {
    return res.status(413).json({ error: "Request body too large" })
  }
  console.error(err)
  res.status(500).json({ error: "Service unavailable" })
})

// Safety net: prevent crashed sockets from taking down the entire process
process.on("uncaughtException", (err) => {
  if (err.code === "EPIPE" || err.code === "ECONNRESET") return // client disconnect — safe to ignore
  console.error("Uncaught exception:", err)
})

const server = app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`))

process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully")
  server.close(() => {
    console.log("Server closed")
    process.exit(0)
  })
  // Force shutdown after 10s
  setTimeout(() => process.exit(1), 10000).unref()
})
