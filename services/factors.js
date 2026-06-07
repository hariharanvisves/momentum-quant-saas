// services/factors.js
//
// Computable factors for the scoring formula engine.
// Each function: (closes: number[]) => number
// Returns 0 when insufficient data.

const TRADING_DAYS_PER_MONTH = 21

/**
 * X Month Performance = price return over X*21 trading days.
 * (closes[end] - closes[end - period]) / closes[end - period]
 */
function performance(closes, months) {
  const period = months * TRADING_DAYS_PER_MONTH
  if (closes.length <= period) return 0
  const current = closes[closes.length - 1]
  const past = closes[closes.length - 1 - period]
  if (!past || past <= 0) return 0
  const result = (current - past) / past
  return isFinite(result) ? result : 0
}

/**
 * X Month Volatility = annualized standard deviation of daily log returns
 * over the last X*21 trading days.
 */
function volatility(closes, months) {
  const period = months * TRADING_DAYS_PER_MONTH
  if (closes.length <= period) return 0
  const slice = closes.slice(-period)
  const logReturns = []
  for (let i = 1; i < slice.length; i++) {
    if (slice[i] > 0 && slice[i - 1] > 0) {
      const r = Math.log(slice[i] / slice[i - 1])
      if (isFinite(r)) logReturns.push(r)
    }
  }
  if (logReturns.length < 2) return 0
  const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length
  const variance =
    logReturns.reduce((a, r) => a + (r - mean) ** 2, 0) / (logReturns.length - 1)
  const result = Math.sqrt(variance * 252)
  return isFinite(result) ? result : 0
}

// Registry: maps canonical factor names to compute functions.
// Keys are lowercase for case-insensitive matching.
const FACTOR_REGISTRY = {
  // ── Performance (price return over N months) ──────────────────────────────
  "1 month performance":  (closes) => performance(closes, 1),
  "3 month performance":  (closes) => performance(closes, 3),
  "6 month performance":  (closes) => performance(closes, 6),
  "9 month performance":  (closes) => performance(closes, 9),
  "12 month performance": (closes) => performance(closes, 12),

  // ── Volatility (annualised std-dev of log returns over N months) ───────────
  "1 month volatility":   (closes) => volatility(closes, 1),
  "3 month volatility":   (closes) => volatility(closes, 3),
  "6 month volatility":   (closes) => volatility(closes, 6),
  "9 month volatility":   (closes) => volatility(closes, 9),
  "12 month volatility":  (closes) => volatility(closes, 12),

  // ── Price-level factors ────────────────────────────────────────────────────
  //  52 week high ratio  = close / max(close[-252:])
  //    Range: 0..1  — closer to 1 means near the 52-week high (bullish signal)
  //    George & Hwang (2004): nearness to 52-week high predicts future returns.
  "52 week high ratio": (closes) => {
    const period = 252
    if (closes.length < period) return 0
    const slice = closes.slice(-period)
    const high = Math.max(...slice)
    if (!high || high <= 0) return 0
    const r = closes[closes.length - 1] / high
    return isFinite(r) ? r : 0
  },

  //  52 week low ratio   = close / min(close[-252:])
  //    Range: ≥1 — higher = further above the 52-week low (strength signal).
  "52 week low ratio": (closes) => {
    const period = 252
    if (closes.length < period) return 0
    const slice = closes.slice(-period)
    const low = Math.min(...slice.filter(v => v > 0))
    if (!low || low <= 0) return 0
    const r = closes[closes.length - 1] / low
    return isFinite(r) ? r : 0
  },

  //  1 year return excluding last month  (classic "12-1" momentum)
  //    = 12 month performance - 1 month performance
  //    Removes short-term reversal effect (Jegadeesh & Titman, 1993).
  "12 minus 1 month performance": (closes) => {
    const r12 = performance(closes, 12)
    const r1  = performance(closes, 1)
    return r12 - r1
  },

  //  Trend efficiency = 12m performance / (12m volatility * sqrt(252))
  //    Sharpe-like ratio using annual return vs annual vol.
  //    Higher = stronger risk-adjusted trend.
  //    Returns 9999 when volatility is zero (see formula.js div/0 rule).
  "trend efficiency": (closes) => {
    const perf = performance(closes, 12)
    const vol  = volatility(closes, 12)
    if (vol <= 0) return 9999
    const r = perf / vol
    return isFinite(r) ? r : 0
  },
}

/**
 * Returns sorted array of factor names (longest first, for greedy matching).
 */
function getFactorNames() {
  return Object.keys(FACTOR_REGISTRY).sort((a, b) => b.length - a.length)
}

/**
 * Compute all factor values for a given closes array.
 * Returns { "1 month performance": 0.05, "3 month volatility": 0.22, ... }
 */
function computeAll(closes) {
  const result = {}
  for (const [name, fn] of Object.entries(FACTOR_REGISTRY)) {
    result[name] = fn(closes)
  }
  return result
}

/**
 * Compute a single named factor.
 * Throws if factor name is unknown.
 */
function compute(name, closes) {
  const fn = FACTOR_REGISTRY[name.toLowerCase()]
  if (!fn) throw new Error(`Unknown factor: ${name}`)
  return fn(closes)
}

module.exports = {
  performance,
  volatility,
  FACTOR_REGISTRY,
  getFactorNames,
  computeAll,
  compute,
  TRADING_DAYS_PER_MONTH,
}
