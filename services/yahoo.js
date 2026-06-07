const yahooFinance = require("yahoo-finance2").default

yahooFinance.suppressNotices(["ripHistorical"])

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
]

yahooFinance.setGlobalConfig({
  queue: { concurrency: 1, timeout: 60000 },
  YF_QUERY_HOST: process.env.YF_QUERY_HOST || "query1.finance.yahoo.com",
})

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

async function fetchChart(symbol, { period1 = "2010-01-01", retries = 4 } = {}) {
  for (let i = 0; i < retries; i++) {
    try {
      const opts = getModuleOpts(i)
      return await yahooFinance.chart(symbol + ".NS", {
        period1,
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

function isSkippable(e) {
  return /delisted|no data|not found/i.test(String(e?.message || ""))
}

module.exports = { fetchChart, delay, isSkippable }
