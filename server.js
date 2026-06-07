
require("dotenv").config()
const db = require("./db")
const express = require("express")
const cors = require("cors")

const app = express()
app.use(cors())
app.use(express.json())
app.use(express.static("public"))

const scanner = require("./services/scanner")
const backtest = require("./services/backtest")
const optimizer = require("./services/optimizer")
const kite = require("./services/kite")

const handle = (fn) => (req, res) => {
  fn(req, res).catch((err) => {
    console.error(err)
    res.status(503).json({ error: err.message || "Service unavailable" })
  })
}

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

app.get("/api/scanner", handle(async (req, res) => {
  const universe = req.query.universe || "nifty500"
  const limit = req.query.limit ? Number(req.query.limit) : null
  const config = {}
  if (req.query.topN) config.topN = Number(req.query.topN)
  if (req.query.lookbacks) config.lookbacks = req.query.lookbacks.split(",").map(Number)
  const result = await scanner.scan({ universe, limit, config })
  res.json(result)
}))

app.post("/api/optimize", handle(async (req, res) => {
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

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`))
