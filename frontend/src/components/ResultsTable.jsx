export default function ResultsTable({ scores, title }) {
  if (!scores || scores.length === 0) {
    return <div className="empty">No results</div>
  }

  return (
    <div className="results-card">
      {title && <h3>{title}</h3>}
      <table className="results-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Symbol</th>
            <th>Score</th>
            <th>Momentum</th>
            <th>Volatility</th>
          </tr>
        </thead>
        <tbody>
          {scores.map((row, i) => (
            <tr key={row.symbol}>
              <td className="rank">{i + 1}</td>
              <td className="symbol">{row.symbol}</td>
              <td className={`score ${row.score >= 0 ? "positive" : "negative"}`}>
                {row.score.toFixed(4)}
              </td>
              <td>{row.momentum?.toFixed(4) ?? "—"}</td>
              <td>{row.volatility?.toFixed(4) ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
