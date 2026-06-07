
const yahooFinance = require("yahoo-finance2").default
const fs = require("fs")
const path = require("path")

yahooFinance.suppressNotices(["ripHistorical"])

// Yahoo blocks bot User-Agents; rotate browser-like UAs
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
]

// Serialize requests, reduce rate limit hits. Try query1 if query2 is blocked.
yahooFinance.setGlobalConfig({
  queue: { concurrency: 1, timeout: 60000 },
  YF_QUERY_HOST: process.env.YF_QUERY_HOST || "query1.finance.yahoo.com",
})

const UNIVERSES_DIR = path.join(__dirname, "..", "data", "universes")
const DEFAULT_UNIVERSE = "nifty500"

function loadUniverse(name = DEFAULT_UNIVERSE) {
  const file = path.join(UNIVERSES_DIR, `${name}.json`)
  if (!fs.existsSync(file)) throw new Error(`Unknown universe: ${name}`)
  return JSON.parse(fs.readFileSync(file))
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

const isRateLimited = (e) => {
  const msg = String(e?.message || e || "")
  return msg.includes("Too Many Requests") || msg.includes("invalid json") || msg.includes("invalid-json")
}

function getModuleOpts(uaIndex = 0) {
  return {
    fetchOptions: {
      headers: {
        "User-Agent": USER_AGENTS[uaIndex % USER_AGENTS.length],
        Accept: "application/json",
        "Accept-Language": "en-US,en;q=0.9",
      },
    },
    queue: { concurrency: 1 },
  }
}

async function fetchChart(symbol, retries = 4) {
  for (let i = 0; i < retries; i++) {
    try {
      const opts = getModuleOpts(i)
      return await yahooFinance.chart(symbol + ".NS", {
        period1: "2010-01-01",
        interval: "1d",
        events: "",
        includePrePost: false,
      }, opts)
    } catch (e) {
      if (isRateLimited(e) && i < retries - 1) {
        const backoff = 5000 * (i + 1)
        console.warn(`Rate limited on ${symbol}, retry ${i + 1}/${retries} in ${backoff / 1000}s`)
        await delay(backoff)
      } else {
        throw e
      }
    }
  }
}

const SCAN_LIMIT = 15
const REQUEST_DELAY_MS = 4000

async function scan(opts = {}) {
  const universeName = opts.universe || DEFAULT_UNIVERSE
  const universe = loadUniverse(universeName)
  const scores = []

  // Warm-up delay before first request
  await delay(3000)

  for (const symbol of universe.slice(0, SCAN_LIMIT)) {
    let result
    try {
      result = await fetchChart(symbol)
    } catch (e) {
      if (/delisted|no data|not found/i.test(String(e?.message || ""))) {
        console.warn(`Skip ${symbol}: ${e.message}`)
        await delay(REQUEST_DELAY_MS)
        continue
      }
      throw e
    }

    const data = result?.quotes ?? []
    if (data.length < 200) continue

    const closes = data.map((d) => d.close).filter((c) => c != null && c > 0)

    // Log returns: more accurate for volatility, time-additive
    const logReturns = []
    for (let i = 1; i < closes.length; i++) {
      const r = Math.log(closes[i] / closes[i - 1])
      if (isFinite(r)) logReturns.push(r)
    }

    /** Momentum: ROC (Rate of Change) - exact percentage return over lookback */
    function mom(lb) {
      if (lb >= closes.length) return 0
      const p = closes[closes.length - 1]
      const pOld = closes[closes.length - 1 - lb]
      if (!pOld || pOld <= 0) return 0
      const roc = (p - pOld) / pOld
      return isFinite(roc) ? roc : 0
    }

    /** Volatility: annualized full-history (log returns, sample std n-1) */
    function vol(returns) {
      if (returns.length < 2) return 0
      const n = returns.length
      const mean = returns.reduce((a, b) => a + b, 0) / n
      const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / (n - 1)
      return Math.sqrt(variance * 252)
    }

    const momentum = mom(21) + mom(63) + mom(126) + mom(189)
    const volatility = vol(logReturns)

    scores.push({ symbol, score: momentum - volatility })
    await delay(REQUEST_DELAY_MS)
  }

  scores.sort((a, b) => b.score - a.score)

  return {
    top20: scores.slice(0, 20),
    universe: universeName,
  }
}

module.exports = { scan }
