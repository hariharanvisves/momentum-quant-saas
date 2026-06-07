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
      console.warn(`Backtest skip ${symbol}: ${e.message}`)
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
