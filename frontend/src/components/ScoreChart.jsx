import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts"

export default function ScoreChart({ scores }) {
  if (!scores || scores.length === 0) return null

  const data = scores.map((s) => ({
    symbol: s.symbol,
    score: +s.score.toFixed(4),
  }))

  return (
    <div className="chart-container">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 40 }}>
          <XAxis dataKey="symbol" angle={-45} textAnchor="end" fontSize={11} />
          <YAxis fontSize={12} />
          <Tooltip />
          <Bar dataKey="score">
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.score >= 0 ? "#22c55e" : "#ef4444"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
