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
