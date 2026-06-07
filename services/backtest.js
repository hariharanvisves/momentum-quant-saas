// services/backtest.js
//
// Backtest engine with custom formula support and 11 performance metrics.

const fs = require("fs")
const path = require("path")
const db = require("../db")
const { fetchChart, delay } = require("./yahoo")
const { computeAll } = require("./factors")
const { parse: parseFormula } = require("./formula")
const { calcMomentum } = require("./scanner")
const { calcSupertrend } = require("./indicators")

const UNIVERSES_DIR = path.join(__dirname, "..", "data", "universes")

function calcRollingVol(logReturns, idx, window = 63) {
  const start = Math.max(0, idx - window + 1)
  const slice = logReturns.slice(start, idx + 1)
  if (slice.length < 2) return 0
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length
  const variance = slice.reduce((a, r) => a + (r - mean) ** 2, 0) / (slice.length - 1)
  return Math.sqrt(variance * 252)
}

/**
 * Score a stock at a point in time using either a compiled formula or legacy lookbacks.
 */
function scoreStock(closesUpToDate, compiledFormula, lookbacks) {
  if (compiledFormula) {
    const factorValues = computeAll(closesUpToDate)
    try {
      return compiledFormula.evaluate(factorValues)
    } catch {
      return -Infinity
    }
  }

  const momentum = calcMomentum(closesUpToDate, lookbacks)
  const logReturns = []
  for (let j = 1; j < closesUpToDate.length; j++) {
    const r = Math.log(closesUpToDate[j] / closesUpToDate[j - 1])
    if (isFinite(r)) logReturns.push(r)
  }
  const vol = calcRollingVol(logReturns, logReturns.length - 1)
  return momentum - vol
}

/**
 * Compute all 11 performance metrics from trade records and equity curve.
 */
function computeMetrics(trades, equityCurve, initialCapital) {
  const finalValue = equityCurve.length > 0
    ? equityCurve[equityCurve.length - 1].value
    : initialCapital
  const years = equityCurve.length / 252

  const totalReturn = (finalValue - initialCapital) / initialCapital
  // Require at least 6 months of data (0.5 years) for a meaningful CAGR
  const cagr = years >= 0.5 ? (Math.pow(finalValue / initialCapital, 1 / years) - 1) : 0

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
  const avgReturn = dailyReturns.length > 0
    ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length
    : 0
  const stdReturn = dailyReturns.length > 1
    ? Math.sqrt(dailyReturns.reduce((a, r) => a + (r - avgReturn) ** 2, 0) / (dailyReturns.length - 1))
    : 0
  const sharpe = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(252) : 0

  const closedTrades = trades.filter((t) => t.exitPrice != null)
  const tradeROIs = closedTrades.map((t) => (t.exitPrice - t.entryPrice) / t.entryPrice)

  const winners = tradeROIs.filter((r) => r > 0)
  const losers = tradeROIs.filter((r) => r <= 0)

  const winRate = closedTrades.length > 0
    ? (winners.length / closedTrades.length) * 100
    : 0

  const avgWinnersROI = winners.length > 0
    ? (winners.reduce((a, b) => a + b, 0) / winners.length) * 100
    : 0

  const avgLosersROI = losers.length > 0
    ? (losers.reduce((a, b) => a + b, 0) / losers.length) * 100
    : 0

  const biggestWinnerROI = winners.length > 0
    ? Math.max(...winners) * 100
    : 0

  const biggestLoserROI = losers.length > 0
    ? Math.min(...losers) * 100
    : 0

  const riskToReward = avgLosersROI !== 0
    ? Math.abs(avgWinnersROI / avgLosersROI)
    : 0

  const avgTradesPerYear = years > 0
    ? closedTrades.length / years
    : closedTrades.length

  return {
    investedCapital: initialCapital,
    currentCapital: Math.round(finalValue),
    totalReturn: +(totalReturn * 100).toFixed(2),
    cagr: +(cagr * 100).toFixed(2),
    sharpe: +sharpe.toFixed(3),
    maxDrawdown: +(maxDrawdown * 100).toFixed(2),
    winRate: +winRate.toFixed(1),
    avgWinnersROI: +avgWinnersROI.toFixed(2),
    avgLosersROI: +avgLosersROI.toFixed(2),
    biggestWinnerROI: +biggestWinnerROI.toFixed(2),
    biggestLoserROI: +biggestLoserROI.toFixed(2),
    riskToReward: +riskToReward.toFixed(2),
    avgTradesPerYear: +avgTradesPerYear.toFixed(1),
    totalTrades: closedTrades.length,
  }
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
    formula = null,
    exitRank = null,
    regimeFilter = null,
    uncorrelatedAsset = null,
  } = params

  // Sanitize numeric inputs — null/NaN from JSON serialization of empty form fields
  const safeCapital = (Number(initialCapital) > 0) ? Number(initialCapital) : 1000000
  const safeTopN = (Number(topN) > 0) ? Number(topN) : 10
  const safeRebalFreq = (Number(rebalanceFrequency) > 0) ? Number(rebalanceFrequency) : 21
  const safeSymbolLimit = (Number(symbolLimit) > 0) ? Number(symbolLimit) : 30

  let compiledFormula = null
  if (formula) {
    compiledFormula = parseFormula(formula)
  }

  const file = path.join(UNIVERSES_DIR, `${universe}.json`)
  if (!fs.existsSync(file)) {
    const err = new Error(`Unknown universe: ${universe}`)
    err.status = 400
    throw err
  }
  const symbols = JSON.parse(fs.readFileSync(file)).slice(0, safeSymbolLimit)

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

  // --- Regime filter: build date->trend lookup using Supertrend on NIFTY 50 ---
  let regimeData = null
  if (regimeFilter && regimeFilter.enabled) {
    const rfPeriod = regimeFilter.period || 10
    const rfMultiplier = regimeFilter.multiplier || 3
    try {
      const yahooFinance = require("yahoo-finance2").default
      const indexResult = await yahooFinance.chart("^NSEI", {
        period1: "2015-01-01",
        interval: "1d",
        events: "",
        includePrePost: false,
      })
      const indexQuotes = indexResult?.quotes ?? []
      // Filter quotes where all OHLC values are valid to keep dates aligned with indicator arrays
      const cleanQuotes = indexQuotes.filter(q =>
        q.high != null && q.high > 0 &&
        q.low != null && q.low > 0 &&
        q.close != null && q.close > 0
      )
      if (cleanQuotes.length > rfPeriod + 1) {
        const highs = cleanQuotes.map(q => q.high)
        const lows = cleanQuotes.map(q => q.low)
        const closes = cleanQuotes.map(q => q.close)
        const dates = cleanQuotes.map(q => q.date.toISOString().slice(0, 10))
        const { trend } = calcSupertrend(highs, lows, closes, rfPeriod, rfMultiplier)
        regimeData = {}
        for (let i = 0; i < dates.length; i++) {
          regimeData[dates[i]] = trend[i]
        }
      }
    } catch (e) {
      console.warn(`Regime filter: failed to fetch index data: ${e.message}`)
    }
  }

  // --- Benchmark: fetch NIFTY 50 index, normalize to initialCapital ---
  let benchmarkCurve = []
  try {
    const yahooFinance = require("yahoo-finance2").default
    const benchResult = await yahooFinance.chart("^NSEI", {
      period1: "2015-01-01",
      interval: "1d",
      events: "",
      includePrePost: false,
    })
    const benchQuotes = benchResult?.quotes ?? []
    if (benchQuotes.length > 0) {
      const benchMap = {}
      for (const q of benchQuotes) {
        const d = q.date.toISOString().slice(0, 10)
        if (q.close != null && q.close > 0) benchMap[d] = q.close
      }
      let benchStart = null
      for (let di = 200; di < dateIndex.length; di++) {
        if (benchMap[dateIndex[di]]) { benchStart = benchMap[dateIndex[di]]; break }
      }
      if (benchStart) {
        for (let di = 200; di < dateIndex.length; di++) {
          const d = dateIndex[di]
          if (benchMap[d]) {
            benchmarkCurve.push({ date: d, value: Math.round((benchMap[d] / benchStart) * safeCapital) })
          }
        }
      }
    }
  } catch (e) {
    console.warn(`Benchmark fetch failed: ${e.message}`)
  }

  let capital = safeCapital
  const equityCurve = []
  let holdings = {}
  const allTrades = []

  for (let di = 200; di < dateIndex.length; di++) {
    const date = dateIndex[di]

    if ((di - 200) % safeRebalFreq === 0) {
      const scores = []
      for (const sym of validSymbols) {
        const quotes = priceData[sym]
        const matchIdx = quotes.findIndex((q) => q.date.toISOString().slice(0, 10) >= date)
        if (matchIdx < 0 || matchIdx < Math.max(...lookbacks)) continue

        const closesUpToDate = quotes.slice(0, matchIdx + 1)
          .map((q) => q.close)
          .filter((c) => c != null && c > 0)
        if (closesUpToDate.length < Math.max(...lookbacks)) continue

        const price = quotes[matchIdx].close
        if (!price || price <= 0) continue
        const score = scoreStock(closesUpToDate, compiledFormula, lookbacks)
        scores.push({ symbol: sym, score, price })
      }

      scores.sort((a, b) => b.score - a.score)

      // Build rank lookup for FRR
      const rankMap = {}
      scores.forEach((s, i) => { rankMap[s.symbol] = i + 1 })

      const portfolioValue = Object.entries(holdings).reduce((sum, [sym, pos]) => {
        const quotes = priceData[sym]
        const matchIdx = quotes.findIndex((q) => q.date.toISOString().slice(0, 10) >= date)
        const exitPrice = matchIdx >= 0 ? quotes[matchIdx].close : 0
        return sum + pos.quantity * exitPrice
      }, capital)

      if (exitRank && exitRank > 0 && Object.keys(holdings).length > 0) {
        // --- FRR: Find-Remove-Replace ---
        const keepSymbols = []
        const removeSymbols = []
        for (const sym of Object.keys(holdings)) {
          const rank = rankMap[sym]
          if (rank !== undefined && rank <= exitRank) {
            keepSymbols.push(sym)
          } else {
            removeSymbols.push(sym)
          }
        }

        // Record exits for removed stocks
        let availableCash = capital
        for (const sym of removeSymbols) {
          const pos = holdings[sym]
          const quotes = priceData[sym]
          const matchIdx = quotes.findIndex((q) => q.date.toISOString().slice(0, 10) >= date)
          const exitPrice = matchIdx >= 0 ? quotes[matchIdx].close : pos.entryPrice
          allTrades.push({ symbol: sym, entryPrice: pos.entryPrice, exitPrice, entryDate: pos.entryDate, exitDate: date, quantity: pos.quantity })
          availableCash += pos.quantity * exitPrice
          delete holdings[sym]
        }

        // Fill vacated slots with top-ranked not already held
        const slotsToFill = safeTopN - keepSymbols.length
        const candidates = scores.filter(s => !keepSymbols.includes(s.symbol)).slice(0, slotsToFill)
        if (candidates.length > 0) {
          const perNew = availableCash / candidates.length
          for (const s of candidates) {
            if (s.price > 0) {
              const qty = Math.floor(perNew / s.price)
              if (qty > 0) {
                holdings[s.symbol] = { quantity: qty, entryPrice: s.price, entryDate: date }
                availableCash -= qty * s.price
              }
            }
          }
        }
        capital = availableCash
      } else {
        // --- Full replacement rebalancing ---
        let selected = scores.slice(0, safeTopN)

        // Apply regime filter
        let isBearish = false
        if (regimeData && regimeFilter) {
          const trendValue = regimeData[date]
          if (trendValue === -1) {
            isBearish = true
            const action = regimeFilter.action || "half_portfolio"
            if (action === "half_portfolio") {
              selected = selected.slice(0, Math.max(1, Math.ceil(selected.length / 2)))
            } else if (action === "quarter_portfolio") {
              selected = selected.slice(0, Math.max(1, Math.ceil(selected.length / 4)))
            } else if (action === "exit_all") {
              selected = []
            }
          }
        }

        // Record exits
        for (const [sym, pos] of Object.entries(holdings)) {
          const quotes = priceData[sym]
          const matchIdx = quotes.findIndex((q) => q.date.toISOString().slice(0, 10) >= date)
          const exitPrice = matchIdx >= 0 ? quotes[matchIdx].close : pos.entryPrice
          allTrades.push({ symbol: sym, entryPrice: pos.entryPrice, exitPrice, entryDate: pos.entryDate, exitDate: date, quantity: pos.quantity })
        }

        if (selected.length === 0) {
          // Close all holdings
          holdings = {}
          // If uncorrelated asset is enabled in bearish regime, park all capital there
          if (uncorrelatedAsset?.enabled && isBearish) {
            const altSymbol = uncorrelatedAsset.symbol || "GOLDBEES"
            if (!priceData[altSymbol]) {
              try {
                const altResult = await fetchChart(altSymbol, { period1: "2015-01-01", retries: 2 })
                const altQuotes = altResult?.quotes ?? []
                if (altQuotes.length > 50) priceData[altSymbol] = altQuotes
              } catch (e) {
                console.warn(`Uncorrelated asset skip ${altSymbol}: ${e.message}`)
              }
            }
            if (priceData[altSymbol]) {
              const altQuotes = priceData[altSymbol]
              const altIdx = altQuotes.findIndex((q) => q.date.toISOString().slice(0, 10) >= date)
              if (altIdx >= 0 && altQuotes[altIdx].close > 0) {
                const altPrice = altQuotes[altIdx].close
                const altQty = Math.floor(portfolioValue / altPrice)
                if (altQty > 0) {
                  holdings[altSymbol] = { quantity: altQty, entryPrice: altPrice, entryDate: date }
                  capital = portfolioValue - altQty * altPrice
                } else {
                  capital = portfolioValue
                }
              } else {
                capital = portfolioValue
              }
            } else {
              capital = portfolioValue
            }
          } else {
            capital = portfolioValue
          }
        } else {
          const altSlots = (isBearish && uncorrelatedAsset?.enabled) ? 1 : 0
          const totalSlots = selected.length + altSlots
          const perStock = portfolioValue / totalSlots
          holdings = {}
          capital = 0
          for (const s of selected) {
            if (s.price > 0) {
              const qty = Math.floor(perStock / s.price)
              holdings[s.symbol] = { quantity: qty, entryPrice: s.price, entryDate: date }
              capital += perStock - qty * s.price
            }
          }
          // Allocate freed slot to uncorrelated asset during bearish regime
          if (altSlots > 0) {
            const altSymbol = uncorrelatedAsset.symbol || "GOLDBEES"
            if (!priceData[altSymbol]) {
              try {
                const altResult = await fetchChart(altSymbol, { period1: "2015-01-01", retries: 2 })
                const altQuotes = altResult?.quotes ?? []
                if (altQuotes.length > 50) priceData[altSymbol] = altQuotes
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
                  holdings[altSymbol] = { quantity: altQty, entryPrice: altPrice, entryDate: date }
                  capital += perStock - altQty * altPrice
                }
              }
            }
          }
        }
      }
    }

    let portfolioValue = capital
    for (const [sym, pos] of Object.entries(holdings)) {
      const quotes = priceData[sym]
      const matchIdx = quotes.findIndex((q) => q.date.toISOString().slice(0, 10) >= date)
      const price = matchIdx >= 0 ? quotes[matchIdx].close : 0
      portfolioValue += pos.quantity * price
    }

    equityCurve.push({ date, value: portfolioValue })
  }

  const lastDate = dateIndex[dateIndex.length - 1] || endDate
  for (const [sym, pos] of Object.entries(holdings)) {
    const quotes = priceData[sym]
    const lastQuote = quotes[quotes.length - 1]
    const exitPrice = lastQuote ? lastQuote.close : pos.entryPrice

    allTrades.push({
      symbol: sym,
      entryPrice: pos.entryPrice,
      exitPrice,
      entryDate: pos.entryDate,
      exitDate: lastDate,
      quantity: pos.quantity,
    })
  }

  const metrics = computeMetrics(allTrades, equityCurve, safeCapital)

  // --- Monthly returns ---
  const monthlyReturns = []
  const monthMap = {}
  for (const point of equityCurve) {
    const ym = point.date.slice(0, 7)
    if (!monthMap[ym]) monthMap[ym] = { first: point.value, last: point.value }
    monthMap[ym].last = point.value
  }
  const ymKeys = Object.keys(monthMap).sort()
  for (let i = 0; i < ymKeys.length; i++) {
    const ym = ymKeys[i]
    const [year, month] = ym.split("-")
    const startVal = i === 0 ? safeCapital : monthMap[ymKeys[i - 1]].last
    const endVal = monthMap[ym].last
    const ret = startVal > 0 ? ((endVal - startVal) / startVal) * 100 : 0
    monthlyReturns.push({
      year: Number(year),
      month: Number(month),
      returnPct: +ret.toFixed(2),
      absReturn: Math.round(endVal - startVal),
      startValue: Math.round(startVal),
      endValue: Math.round(endVal),
    })
  }

  // --- Drawdown curve ---
  let peak = 0
  const drawdownCurve = []
  for (const point of equityCurve) {
    if (point.value > peak) peak = point.value
    const dd = peak > 0 ? ((peak - point.value) / peak) * 100 : 0
    drawdownCurve.push({ date: point.date, portfolioDD: +dd.toFixed(2) })
  }

  // Add benchmark drawdown
  if (benchmarkCurve.length > 0) {
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

  const result = {
    universe,
    startDate,
    endDate,
    formula: formula || null,
    ...metrics,
    finalValue: metrics.currentCapital,
    symbolsUsed: validSymbols.length,
    rebalances: Math.max(0, Math.floor((dateIndex.length - 200) / safeRebalFreq)),
    equityCurve: equityCurve.filter((_, i) => i % 5 === 0),
    benchmarkCurve: benchmarkCurve.filter((_, i) => i % 5 === 0),
    monthlyReturns,
    drawdownCurve: drawdownCurve.filter((_, i) => i % 5 === 0),
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

module.exports = { run, computeMetrics, scoreStock }
