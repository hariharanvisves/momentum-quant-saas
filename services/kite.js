const { KiteConnect } = require("kiteconnect")

let kite = null

function getKite() {
  if (!kite) {
    const apiKey = process.env.KITE_API_KEY
    if (!apiKey) throw new Error("KITE_API_KEY not set in environment")
    kite = new KiteConnect({ api_key: apiKey })
    const accessToken = process.env.KITE_ACCESS_TOKEN
    if (accessToken) {
      kite.setAccessToken(accessToken)
    }
  }
  return kite
}

function setAccessToken(token) {
  getKite().setAccessToken(token)
}

async function getLoginURL() {
  return getKite().getLoginURL()
}

async function generateSession(requestToken) {
  const apiSecret = process.env.KITE_API_SECRET
  if (!apiSecret) throw new Error("KITE_API_SECRET not set in environment")
  const k = getKite()
  const session = await k.generateSession(requestToken, apiSecret)
  k.setAccessToken(session.access_token)
  return session
}

async function getPositions() {
  return getKite().getPositions()
}

async function getHoldings() {
  return getKite().getHoldings()
}

async function placeOrder(symbol, quantity, side = "BUY") {
  const k = getKite()
  const params = {
    exchange: "NSE",
    tradingsymbol: symbol,
    transaction_type: side,
    quantity,
    product: "CNC",
    order_type: "MARKET",
    validity: "DAY",
  }
  return k.placeOrder("regular", params)
}

async function executeOrders(top20, { capitalPerStock = 50000, dryRun = false } = {}) {
  const k = getKite()
  const results = []

  for (const stock of top20) {
    try {
      const quote = await k.getQuote([`NSE:${stock.symbol}`])
      const ltp = quote[`NSE:${stock.symbol}`]?.last_price
      if (!ltp || ltp <= 0) {
        results.push({ symbol: stock.symbol, status: "skipped", reason: "no price" })
        continue
      }

      const quantity = Math.floor(capitalPerStock / ltp)
      if (quantity <= 0) {
        results.push({ symbol: stock.symbol, status: "skipped", reason: "quantity 0" })
        continue
      }

      if (dryRun) {
        results.push({ symbol: stock.symbol, status: "dry_run", quantity, price: ltp })
        continue
      }

      const order = await placeOrder(stock.symbol, quantity, "BUY")
      results.push({
        symbol: stock.symbol,
        status: "placed",
        orderId: order.order_id,
        quantity,
        price: ltp,
      })
    } catch (e) {
      results.push({ symbol: stock.symbol, status: "error", error: e.message })
    }
  }

  return results
}

module.exports = {
  getLoginURL,
  generateSession,
  setAccessToken,
  getPositions,
  getHoldings,
  placeOrder,
  executeOrders,
}
