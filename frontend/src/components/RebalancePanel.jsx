import { useState } from "react"
import { api } from "../api"
import ResultsTable from "./ResultsTable"

export default function RebalancePanel() {
  const [universe, setUniverse] = useState("nifty500")
  const [execute, setExecute] = useState(false)
  const [dryRun, setDryRun] = useState(true)
  const [capitalPerStock, setCapitalPerStock] = useState(50000)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  async function runRebalance() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.rebalance({
        universe,
        execute,
        dryRun,
        capitalPerStock: Number(capitalPerStock),
      })
      setResult(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="panel">
      <div className="controls">
        <div className="control-group">
          <label>Universe</label>
          <select value={universe} onChange={(e) => setUniverse(e.target.value)}>
            <option value="nifty50">NIFTY 50</option>
            <option value="nifty100">NIFTY 100</option>
            <option value="nifty200">NIFTY 200</option>
            <option value="nifty500">NIFTY 500</option>
          </select>
        </div>
        <div className="control-group">
          <label>₹/Stock</label>
          <input
            type="number"
            value={capitalPerStock}
            onChange={(e) => setCapitalPerStock(e.target.value)}
            min="10000"
            step="10000"
          />
        </div>
        <div className="toggle-wrap">
          <input type="checkbox" checked={execute} onChange={(e) => setExecute(e.target.checked)} />
          <label>Execute Orders</label>
        </div>
        {execute && (
          <div className="toggle-wrap">
            <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
            <label>Dry Run</label>
          </div>
        )}
        <button className="primary" onClick={runRebalance} disabled={loading}>
          {loading ? "Running..." : "Rebalance"}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {result && (
        <>
          {result.orders && (
            <table className="results-table">
              <thead>
                <tr><th>Symbol</th><th>Status</th><th>Qty</th><th>Price</th></tr>
              </thead>
              <tbody>
                {result.orders.map((o, i) => (
                  <tr key={i}>
                    <td className="symbol">{o.symbol}</td>
                    <td className={`status-${o.status}`}>{o.status}</td>
                    <td>{o.quantity || "—"}</td>
                    <td>{o.price ? `₹${o.price.toFixed(2)}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {result.data && <ResultsTable scores={result.data} title="Top Stocks" />}
        </>
      )}
    </div>
  )
}
