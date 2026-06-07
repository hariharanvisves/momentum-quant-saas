import { useState } from "react"
import { api } from "../api"
import ResultsTable from "./ResultsTable"
import ScoreChart from "./ScoreChart"

export default function ScannerPanel() {
  const [universe, setUniverse] = useState("nifty500")
  const [limit, setLimit] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  async function runScan() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.scan(universe, limit ? Number(limit) : undefined)
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
            <option value="nifty250">NIFTY 250</option>
            <option value="nifty500">NIFTY 500</option>
          </select>
        </div>
        <div className="control-group">
          <label>Limit</label>
          <input
            type="number"
            placeholder="All"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            min="1"
            max="500"
          />
        </div>
        <button className="primary" onClick={runScan} disabled={loading}>
          {loading ? "Scanning..." : "Run Scanner"}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {result && (
        <>
          <div className="meta">
            Scanned {result.symbolsScanned}/{result.totalInUniverse} symbols
            · Scan #{result.scanId}
          </div>
          <ScoreChart scores={result.top20} />
          <ResultsTable scores={result.top20} />
        </>
      )}
    </div>
  )
}
