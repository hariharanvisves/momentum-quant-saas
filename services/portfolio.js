const db = require("../db")
const { fetchChart, delay } = require("./yahoo")

const MAX_PORTFOLIOS = 5

/** Creates an error that handle() will pass through to the client with the given HTTP status. */
function appError(message, status = 400) {
  const err = new Error(message)
  err.status = status
  return err
}

function list(userId) {
  return db.prepare(`
    SELECT p.*, COUNT(h.id) as holding_count
    FROM portfolios p
    LEFT JOIN portfolio_holdings h ON h.portfolio_id = p.id
    WHERE p.user_id = ?
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `).all(userId)
}

function get(id) {
  const portfolio = db.prepare("SELECT * FROM portfolios WHERE id = ?").get(id)
  if (!portfolio) return null
  const holdings = db.prepare(
    "SELECT * FROM portfolio_holdings WHERE portfolio_id = ? ORDER BY symbol"
  ).all(id)
  return { ...portfolio, holdings }
}

function create({ name, universe, strategy_id, config_json }, userId) {
  if (!name || !String(name).trim()) throw appError("Portfolio name is required")
  const count = userId
    ? db.prepare("SELECT COUNT(*) as cnt FROM portfolios WHERE user_id = ?").get(userId).cnt
    : db.prepare("SELECT COUNT(*) as cnt FROM portfolios WHERE user_id IS NULL").get().cnt
  if (count >= MAX_PORTFOLIOS) {
    throw appError(`Portfolio limit reached (max ${MAX_PORTFOLIOS}). Upgrade plan to create more.`)
  }
  const result = db.prepare(`
    INSERT INTO portfolios (name, universe, strategy_id, config_json, user_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(name, universe || "nifty500", strategy_id || null, config_json || "{}", userId ?? null)
  return get(result.lastInsertRowid)
}

function update(id, fields) {
  const portfolio = db.prepare("SELECT * FROM portfolios WHERE id = ?").get(id)
  if (!portfolio) throw appError("Portfolio not found", 404)
  const name = fields.name || portfolio.name
  const universe = fields.universe || portfolio.universe
  const config_json = fields.config_json || portfolio.config_json
  db.prepare("UPDATE portfolios SET name = ?, universe = ?, config_json = ? WHERE id = ?")
    .run(name, universe, config_json, id)
  return get(id)
}

function remove(id) {
  const portfolio = db.prepare("SELECT * FROM portfolios WHERE id = ?").get(id)
  if (!portfolio) throw appError("Portfolio not found", 404)
  db.prepare("DELETE FROM portfolio_holdings WHERE portfolio_id = ?").run(id)
  db.prepare("DELETE FROM portfolios WHERE id = ?").run(id)
  return { deleted: true, id }
}

function addHolding(portfolioId, { symbol, quantity, entry_price, entry_date }) {
  if (!symbol || !String(symbol).trim()) throw appError("Symbol is required")
  const qty = Number(quantity)
  const price = Number(entry_price)
  if (!qty || qty <= 0 || !Number.isFinite(qty)) throw appError("Quantity must be a positive number")
  if (!price || price <= 0 || !Number.isFinite(price)) throw appError("Entry price must be a positive number")
  const portfolio = db.prepare("SELECT * FROM portfolios WHERE id = ?").get(portfolioId)
  if (!portfolio) throw appError("Portfolio not found", 404)
  const existing = db.prepare(
    "SELECT * FROM portfolio_holdings WHERE portfolio_id = ? AND symbol = ?"
  ).get(portfolioId, symbol)
  if (existing) {
    const totalQty = existing.quantity + qty
    const avgPrice = ((existing.entry_price * existing.quantity) + (price * qty)) / totalQty
    db.prepare(
      "UPDATE portfolio_holdings SET quantity = ?, entry_price = ? WHERE id = ?"
    ).run(totalQty, avgPrice, existing.id)
    return db.prepare("SELECT * FROM portfolio_holdings WHERE id = ?").get(existing.id)
  }
  const result = db.prepare(`
    INSERT INTO portfolio_holdings (portfolio_id, symbol, quantity, entry_price, entry_date)
    VALUES (?, ?, ?, ?, ?)
  `).run(portfolioId, symbol.toUpperCase().trim(), qty, price, entry_date || new Date().toISOString().slice(0, 10))
  return db.prepare("SELECT * FROM portfolio_holdings WHERE id = ?").get(result.lastInsertRowid)
}

function removeHolding(portfolioId, holdingId) {
  const holding = db.prepare(
    "SELECT * FROM portfolio_holdings WHERE id = ? AND portfolio_id = ?"
  ).get(holdingId, portfolioId)
  if (!holding) throw appError("Holding not found", 404)
  db.prepare("DELETE FROM portfolio_holdings WHERE id = ?").run(holdingId)
  return { deleted: true, id: holdingId }
}

function getPerformance(portfolioId) {
  const portfolio = get(portfolioId)
  if (!portfolio) throw appError("Portfolio not found", 404)
  const holdings = portfolio.holdings || []
  const totalInvested = holdings.reduce((sum, h) => sum + (h.entry_price * h.quantity), 0)
  const totalCurrent = holdings.reduce((sum, h) => sum + (h.current_value || h.entry_price * h.quantity), 0)
  const totalPnl = totalCurrent - totalInvested
  const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0
  const allocation = holdings.map((h) => {
    const value = h.current_value || h.entry_price * h.quantity
    return {
      symbol: h.symbol,
      value,
      percentage: totalCurrent > 0 ? (value / totalCurrent) * 100 : 0,
    }
  })
  return {
    portfolioId,
    name: portfolio.name,
    totalInvested: Math.round(totalInvested),
    totalCurrent: Math.round(totalCurrent),
    totalPnl: Math.round(totalPnl),
    totalPnlPct: +totalPnlPct.toFixed(2),
    holdingCount: holdings.length,
    allocation,
    holdings: holdings.map((h) => ({
      ...h,
      investedValue: Math.round(h.entry_price * h.quantity),
    })),
  }
}

const applyPriceUpdates = db.transaction((updates) => {
  for (const u of updates) {
    db.prepare("UPDATE portfolio_holdings SET current_price=?, current_value=?, pnl=?, pnl_pct=? WHERE id=?")
      .run(u.currentPrice, u.currentValue, u.pnl, u.pnlPct, u.id)
  }
})

async function refreshPrices(portfolioId) {
  const holdings = db.prepare(
    "SELECT * FROM portfolio_holdings WHERE portfolio_id = ?"
  ).all(portfolioId)
  if (holdings.length === 0) return []
  const pendingUpdates = []
  const updated = []
  for (const h of holdings) {
    try {
      const oneYearAgo = new Date(); oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
      const period1 = oneYearAgo.toISOString().slice(0, 10)
      const result = await fetchChart(h.symbol, { period1, retries: 2 })
      const quotes = result?.quotes ?? []
      if (quotes.length === 0) continue
      const currentPrice = quotes[quotes.length - 1].close
      if (!currentPrice || currentPrice <= 0) continue
      const investedValue = h.entry_price * h.quantity
      const currentValue = currentPrice * h.quantity
      const pnl = currentValue - investedValue
      const pnlPct = investedValue > 0 ? (pnl / investedValue) * 100 : 0
      pendingUpdates.push({
        id: h.id,
        currentPrice,
        currentValue: +currentValue.toFixed(2),
        pnl: +pnl.toFixed(2),
        pnlPct: +pnlPct.toFixed(2),
      })
      updated.push({ symbol: h.symbol, currentPrice })
    } catch (e) {
      console.warn(`Price refresh skip ${h.symbol}: ${e.message}`)
    }
    await delay(500)
  }
  if (pendingUpdates.length > 0) applyPriceUpdates(pendingUpdates)
  return updated
}

module.exports = { list, get, create, update, remove, addHolding, removeHolding, getPerformance, refreshPrices }
