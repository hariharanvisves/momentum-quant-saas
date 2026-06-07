
require("dotenv").config()
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
  const result = await scanner.scan({ universe })
  res.json(result)
}))

app.post("/api/optimize", handle(async (req, res) => {
  const result = await optimizer.run()
  res.json(result)
}))

app.post("/api/rebalance", handle(async (req, res) => {
  const { execute, universe = "nifty500" } = req.body
  const result = await scanner.scan({ universe })
  if (execute) {
    await kite.executeOrders(result.top20)
  }
  res.json({ executed: execute, data: result.top20 })
}))

app.listen(3000, () => console.log("Server running on http://localhost:3000"))
