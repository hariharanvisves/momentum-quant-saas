const yahooFinance = require("yahoo-finance2").default
const { delay } = require("./yahoo")
const { loadUniverse } = require("./scanner")

// Safe recursive-descent arithmetic evaluator — no eval / new Function
function _evalArith(expr) {
  const tokens = []
  let i = 0
  while (i < expr.length) {
    if (/\s/.test(expr[i])) { i++; continue }
    if (/[\d.]/.test(expr[i])) {
      let n = ""
      while (i < expr.length && /[\d.]/.test(expr[i])) n += expr[i++]
      tokens.push({ t: "N", v: parseFloat(n) })
    } else if ("+-*/()" .includes(expr[i])) {
      tokens.push({ t: expr[i++] })
    } else {
      return null
    }
  }
  let pos = 0
  const peek = () => (pos < tokens.length ? tokens[pos] : null)
  const eat = () => tokens[pos++]
  function parseExpr() {
    let l = parseTerm()
    while (peek() && (peek().t === "+" || peek().t === "-")) {
      const op = eat().t
      const r = parseTerm()
      l = op === "+" ? l + r : l - r
    }
    return l
  }
  function parseTerm() {
    let l = parseUnary()
    while (peek() && (peek().t === "*" || peek().t === "/")) {
      const op = eat().t
      const r = parseUnary()
      l = op === "/" ? (r === 0 ? 0 : l / r) : l * r
    }
    return l
  }
  function parseUnary() {
    if (peek() && peek().t === "-") { eat(); return -parseUnary() }
    return parsePrimary()
  }
  function parsePrimary() {
    const tok = peek()
    if (!tok) throw new Error("Unexpected end")
    if (tok.t === "N") { eat(); return tok.v }
    if (tok.t === "(") {
      eat()
      const v = parseExpr()
      if (!peek() || peek().t !== ")") throw new Error("Missing )")
      eat()
      return v
    }
    throw new Error(`Unexpected token: ${tok.t}`)
  }
  try {
    const result = parseExpr()
    return isFinite(result) ? result : null
  } catch {
    return null
  }
}

function _evalIntradayFormula(formulaStr, factorValues) {
  const names = Object.keys(factorValues).sort((a, b) => b.length - a.length)
  let expr = formulaStr.trim()
  for (const name of names) {
    const val = factorValues[name]
    expr = expr.replace(new RegExp(`\\b${name}\\b`, "g"), String(isFinite(val) ? val : 0))
  }
  if (!/^[\d\s.+\-*/()]+$/.test(expr)) return null
  return _evalArith(expr)
}

async function fetchIntraday(symbol, interval = "5m") {
  return yahooFinance.chart(symbol + ".NS", {
    period1: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    interval,
    includePrePost: false,
  }, {
    fetchOptions: {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
      },
    },
  })
}

function calcPerformance(closes, bars) {
  if (closes.length < bars + 1) return 0
  const current = closes[closes.length - 1]
  const past = closes[closes.length - 1 - bars]
  if (!past || past <= 0) return 0
  return ((current - past) / past) * 100
}

function calcVolatility(closes, bars) {
  if (closes.length < bars + 1) return 0
  const slice = closes.slice(-bars)
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
      if (quotes.length < 30) {
        await delay(1000)
        continue
      }

      const closes = quotes.map((q) => q.close).filter((c) => c != null && c > 0)
      if (closes.length < 5) {
        await delay(1000)
        continue
      }

      const bars30 = Math.max(1, Math.round(30 * barsPerMinute))
      const bars60 = Math.max(1, Math.round(60 * barsPerMinute))
      const bars90 = Math.max(1, Math.round(90 * barsPerMinute))

      const factorValues = {
        perf30: calcPerformance(closes, bars30),
        perf60: calcPerformance(closes, bars60),
        perf90: calcPerformance(closes, bars90),
        vol30: calcVolatility(closes, bars30),
        vol60: calcVolatility(closes, bars60),
        vol90: calcVolatility(closes, bars90),
        price: closes[closes.length - 1] || 0,
      }

      let scoreVal = factorValues.perf60 - factorValues.vol30
      if (formula) {
        const computed = _evalIntradayFormula(formula, factorValues)
        if (computed !== null) scoreVal = computed
      }

      results.push({
        symbol,
        score: +scoreVal.toFixed(4),
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
