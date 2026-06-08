// services/scoring.js
//
// Orchestrates scoring: load universe, fetch prices, compute factors,
// evaluate formula, filter, rank, persist.

const db = require("../db")
const { fetchChart, delay, isSkippable } = require("./yahoo")
const { loadUniverse } = require("./scanner")
const { computeAll } = require("./factors")
const { parse } = require("./formula")

const DEFAULT_CONFIG = {
  minDataPoints: 200,
  requestDelayMs: 300,
  retries: 4,
}

/**
 * Score all stocks in a universe using a text formula.
 *
 * @param {Object} opts
 * @param {string} opts.formula       - Text formula, e.g. "6 Month Performance / 6 Month Volatility"
 * @param {string} [opts.universe]    - Universe name (default: nifty500)
 * @param {number} [opts.limit]       - Max symbols to scan (for dev/testing)
 * @param {number} [opts.topN]        - Number of top results to return (default: 20)
 * @param {number} [opts.priceMin]    - Minimum stock price filter
 * @param {number} [opts.priceMax]    - Maximum stock price filter
 * @param {number} [opts.page]        - Page number for pagination (1-indexed, default: 1)
 * @param {number} [opts.pageSize]    - Results per page (default: 10)
 * @param {Object} [opts.config]      - Override requestDelayMs, retries, minDataPoints
 *
 * @returns {Object} { scoreId, results, totalResults, page, pageSize, totalPages, universe, symbolsScanned, formula }
 */
async function score(opts = {}) {
  const {
    formula: formulaText,
    universe: universeName = "nifty500",
    limit = null,
    topN = null,
    priceMin = null,
    priceMax = null,
    page = 1,
    pageSize = 10,
    config: configOverrides = {},
  } = opts

  if (!formulaText) {
    const err = new Error("formula is required")
    err.status = 400
    throw err
  }

  const compiled = parse(formulaText)
  const config = { ...DEFAULT_CONFIG, ...configOverrides }
  const universe = loadUniverse(universeName)
  const symbols = limit ? universe.slice(0, limit) : universe

  const allScored = []
  let scanned = 0

  for (const symbol of symbols) {
    let result
    try {
      result = await fetchChart(symbol, { retries: config.retries })
    } catch (e) {
      // Skip delisted/not-found and network errors — don't crash entire score run
      console.warn(`Score skip ${symbol}: ${e.message}`)
      continue
    }

    const data = result?.quotes ?? []
    if (data.length < config.minDataPoints) {
      continue
    }

    const closes = data.map((d) => d.close).filter((c) => c != null && c > 0)
    if (closes.length < config.minDataPoints) {
      continue
    }

    const price = closes[closes.length - 1]

    if (priceMin != null && price < priceMin) {
      continue
    }
    if (priceMax != null && price > priceMax) {
      continue
    }

    const factorValues = computeAll(closes)
    let scoreValue
    try {
      scoreValue = compiled.evaluate(factorValues)
    } catch (e) {
      console.warn(`Score eval skip ${symbol}: ${e.message}`)
      continue
    }

    allScored.push({
      symbol,
      score: scoreValue,
      price,
      factors: factorValues,
    })
    scanned++
    await delay(config.requestDelayMs)
  }

  // Rank by score descending
  allScored.sort((a, b) => b.score - a.score)
  allScored.forEach((item, i) => {
    item.rank = i + 1
  })

  // Apply topN if specified (before pagination)
  const ranked = topN ? allScored.slice(0, topN) : allScored

  // Paginate
  const safePage = Math.max(1, Math.floor(page) || 1)
  const safePageSize = Math.max(1, Math.floor(pageSize) || 10)
  const totalResults = ranked.length
  const totalPages = Math.ceil(totalResults / safePageSize)
  const startIdx = (safePage - 1) * safePageSize
  const pageResults = ranked.slice(startIdx, startIdx + safePageSize)

  // Persist to scan_results + scan_scores
  const insertScan = db.prepare(`
    INSERT INTO scan_results (universe, scan_limit, symbols_scanned, config_json)
    VALUES (?, ?, ?, ?)
  `)
  const insertScore = db.prepare(`
    INSERT INTO scan_scores (scan_id, rank, symbol, score, momentum, volatility)
    VALUES (?, ?, ?, ?, ?, ?)
  `)

  const configJson = JSON.stringify({
    formula: formulaText,
    factors: compiled.factors,
    priceMin,
    priceMax,
    topN,
  })

  const saveScan = db.transaction(() => {
    const { lastInsertRowid } = insertScan.run(
      universeName, symbols.length, scanned, configJson
    )
    const toSave = ranked.slice(0, Math.min(ranked.length, 500))
    toSave.forEach((s) => {
      insertScore.run(
        lastInsertRowid,
        s.rank,
        s.symbol,
        s.score,
        s.factors["6 month performance"] || 0,
        s.factors["6 month volatility"] || 0
      )
    })
    return lastInsertRowid
  })

  const scoreId = saveScan()

  return {
    scoreId,
    results: pageResults,
    totalResults,
    page: safePage,
    pageSize: safePageSize,
    totalPages,
    universe: universeName,
    symbolsScanned: scanned,
    formula: formulaText,
  }
}

module.exports = { score }
