import { useState } from "react"
import { api } from "../api"

export default function OptimizerPanel() {
  const [universe, setUniverse] = useState("nifty50")
  const [symbolLimit, setSymbolLimit] = useState(15)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  async function runOptimizer() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.optimize({ universe, symbolLimit: Number(symbolLimit) })
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
          </select>
        </div>
        <div className="control-group">
          <label>Symbols</label>
          <input type="number" value={symbolLimit} onChange={(e) => setSymbolLimit(e.target.value)} min="5" max="50" />
        </div>
        <button className="primary" onClick={runOptimizer} disabled={loading}>
          {loading ? "Optimizing..." : "Run Optimizer"}
        </button>
      </div>

      {loading && <div className="loading">Optimizer runs many backtests — this takes a while...</div>}
      {error && <div className="error">{error}</div>}

      {result && (
        <>
          {result.best && (
            <div className="best-result">
              <h3>Best Parameters (by Sharpe)</h3>
              <div className="metrics-grid">
                <div className="metric">
                  <span className="metric-label">Top N</span>
                  <span className="metric-value">{result.best.topN}</span>
                </div>
                <div className="metric">
                  <span className="metric-label">Rebal Freq</span>
                  <span className="metric-value">{result.best.rebalanceFrequency}d</span>
                </div>
                <div className="metric">
                  <span className="metric-label">Sharpe</span>
                  <span className="metric-value">{result.best.sharpe}</span>
                </div>
                <div className="metric">
                  <span className="metric-label">CAGR</span>
                  <span className="metric-value">{result.best.cagr}%</span>
                </div>
              </div>
              <p className="meta">Lookbacks: [{result.best.lookbacks.join(", ")}]</p>
            </div>
          )}

          <table className="results-table">
            <thead>
              <tr>
                <th>Top N</th>
                <th>Rebal</th>
                <th>Lookbacks</th>
                <th>Sharpe</th>
                <th>CAGR</th>
                <th>Max DD</th>
              </tr>
            </thead>
            <tbody>
              {result.results.slice(0, 20).map((r, i) => (
                <tr key={i} className={i === 0 ? "best-row" : ""}>
                  <td>{r.topN}</td>
                  <td>{r.rebalanceFrequency}d</td>
                  <td>[{r.lookbacks.join(",")}]</td>
                  <td>{r.sharpe}</td>
                  <td>{r.cagr}%</td>
                  <td>{r.maxDrawdown}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="meta">{result.combinationsTested}/{result.totalCombinations} tested</p>
        </>
      )}
    </div>
  )
}
