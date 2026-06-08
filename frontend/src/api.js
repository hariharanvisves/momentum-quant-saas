const BASE = ""

let authToken = localStorage.getItem("authToken") || null

function setAuthToken(token) {
  authToken = token
  if (token) {
    localStorage.setItem("authToken", token)
  } else {
    localStorage.removeItem("authToken")
  }
}

async function request(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...opts.headers }
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`
  }
  const res = await fetch(BASE + path, { ...opts, headers })
  if (!res.ok) {
    let errMsg = "Request failed"
    try { const data = await res.json(); errMsg = data.error || errMsg } catch {}
    const err = new Error(errMsg)
    err.status = res.status
    throw err
  }
  return res.json()
}

export const api = {
  setAuthToken,
  getAuthToken: () => authToken,

  // Auth
  register: (email, password) =>
    request("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password }) }),
  login: (email, password) =>
    request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  getMe: () => request("/api/auth/me"),
  logout: () => request("/api/auth/logout", { method: "POST" }),
  forgotPassword: (email) =>
    request("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (token, password) =>
    request("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) }),
  changePassword: (data) => request("/api/auth/password", { method: "PUT", body: JSON.stringify(data) }),
  scan: (universe, limit, formula) => {
    let url = `/api/scanner?universe=${encodeURIComponent(universe)}`
    if (limit) url += `&limit=${limit}`
    if (formula) url += `&formula=${encodeURIComponent(formula)}`
    return request(url)
  },

  score: (params) =>
    request("/api/score", { method: "POST", body: JSON.stringify(params) }),

  getScans: (universe) =>
    request(`/api/scans${universe ? `?universe=${encodeURIComponent(universe)}` : ""}`),

  getScan: (id) => request(`/api/scans/${id}`),

  backtest: (params) =>
    request("/api/backtest", { method: "POST", body: JSON.stringify(params) }),

  getBacktests: () => request("/api/backtests"),

  optimize: (params) =>
    request("/api/optimize", { method: "POST", body: JSON.stringify(params) }),

  rebalance: (params) =>
    request("/api/rebalance", { method: "POST", body: JSON.stringify(params) }),

  getUniverses: () => request("/api/universes"),
  getFactors: () => request("/api/factors"),

  kiteLogin: () => request("/api/kite/login"),
  kiteSession: (requestToken) =>
    request("/api/kite/session", { method: "POST", body: JSON.stringify({ requestToken }) }),
  kitePositions: () => request("/api/kite/positions"),
  kiteHoldings: () => request("/api/kite/holdings"),

  getStrategies: () => request("/api/strategies"),
  getStrategy: (id) => request(`/api/strategies/${id}`),
  createStrategy: (body) =>
    request("/api/strategies", { method: "POST", body: JSON.stringify(body) }),
  updateStrategy: (id, body) =>
    request(`/api/strategies/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteStrategy: (id) =>
    request(`/api/strategies/${id}`, { method: "DELETE" }),

  getSectors: () => request("/api/sectors"),

  scoreDownload: (scanId) =>
    fetch(`/api/score/${scanId}/download`, { headers: authToken ? { Authorization: `Bearer ${authToken}` } : {} }).then(res => {
      if (!res.ok) throw new Error("Download failed")
      return res.blob()
    }),

  backtestDownload: (id) =>
    fetch(`/api/backtests/${id}/download`, { headers: authToken ? { Authorization: `Bearer ${authToken}` } : {} }).then(res => {
      if (!res.ok) throw new Error("Download failed")
      return res.blob()
    }),

  // Portfolio
  getPortfolios: () => request("/api/portfolios"),
  getPortfolio: (id) => request(`/api/portfolios/${id}`),
  createPortfolio: (params) =>
    request("/api/portfolios", { method: "POST", body: JSON.stringify(params) }),
  updatePortfolio: (id, params) =>
    request(`/api/portfolios/${id}`, { method: "PUT", body: JSON.stringify(params) }),
  deletePortfolio: (id) =>
    request(`/api/portfolios/${id}`, { method: "DELETE" }),
  addHolding: (portfolioId, params) =>
    request(`/api/portfolios/${portfolioId}/holdings`, { method: "POST", body: JSON.stringify(params) }),
  removeHolding: (portfolioId, holdingId) =>
    request(`/api/portfolios/${portfolioId}/holdings/${holdingId}`, { method: "DELETE" }),
  getPortfolioPerformance: (id) => request(`/api/portfolios/${id}/performance`),

  refreshPortfolioPrices: (id) =>
    request(`/api/portfolios/${id}/refresh`, { method: "POST" }),

  // Presets
  getPresets: () => request("/api/presets"),

  // Intraday
  scoreIntraday: (params) =>
    request("/api/score/intraday", { method: "POST", body: JSON.stringify(params) }),
}

