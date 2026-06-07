import { useState } from "react"
import { api } from "../api"
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"

export default function BacktestPanel() {
  const [universe, setUniverse] = useState("nifty50")
  const [symbolLimit, setSymbolLimit] = useState(20)
  const [topN, setTopN] = useState(10)
  const [rebalFreq, setRebalFreq] = useState(21)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  async function runBacktest() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.backtest({
        universe,
        symbolLimit: Number(symbolLimit),
        topN: Number(topN),
        rebalanceFrequency: Number(rebalFreq),
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
          </select>
        </div>
        <div className="control-group">
          <label>Symbols</label>
          <input type="number" value={symbolLimit} onChange={(e) => setSymbolLimit(e.target.value)} min="5" max="100" />
        </div>
        <div className="control-group">
          <label>Top N</label>
          <input type="number" value={topN} onChange={(e) => setTopN(e.target.value)} min="3" max="30" />
        </div>
        <div className="control-group">
          <label>Rebal (days)</label>
          <input type="number" value={rebalFreq} onChange={(e) => setRebalFreq(e.target.value)} min="1" max="252" />
        </div>
        <button className="primary" onClick={runBacktest} disabled={loading}>
          {loading ? "Running..." : "Run Backtest"}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {result && (
        <>
          <div className="metrics-grid">
            <div className="metric">
              <span className="metric-label">CAGR</span>
              <span className={`metric-value ${result.cagr >= 0 ? "positive" : "negative"}`}>
                {result.cagr}%
              </span>
            </div>
            <div className="metric">
              <span className="metric-label">Sharpe</span>
              <span className="metric-value">{result.sharpe}</span>
            </div>
            <div className="metric">
              <span className="metric-label">Max DD</span>
              <span className="metric-value negative">{result.maxDrawdown}%</span>
            </div>
            <div className="metric">
              <span className="metric-label">Total Return</span>
              <span className={`metric-value ${result.totalReturn >= 0 ? "positive" : "negative"}`}>
                {result.totalReturn}%
              </span>
            </div>
          </div>

          {result.equityCurve && (
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={result.equityCurve}>
                  <XAxis dataKey="date" tickFormatter={(d) => d.slice(0, 7)} fontSize={11} />
                  <YAxis fontSize={12} tickFormatter={(v) => `${(v / 100000).toFixed(1)}L`} />
                  <Tooltip formatter={(v) => `₹${v.toLocaleString()}`} />
                  <Line type="monotone" dataKey="value" stroke="#22c55e" dot={false} strokeWidth={1.5} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  )
}
