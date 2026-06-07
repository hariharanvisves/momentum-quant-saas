const BASE = ""

async function request(path, opts = {}) {
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || "Request failed")
  return data
}

export const api = {
  scan: (universe, limit) =>
    request(`/api/scanner?universe=${encodeURIComponent(universe)}${limit ? `&limit=${limit}` : ""}`),

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

  kiteLogin: () => request("/api/kite/login"),
  kitePositions: () => request("/api/kite/positions"),
  kiteHoldings: () => request("/api/kite/holdings"),
}
