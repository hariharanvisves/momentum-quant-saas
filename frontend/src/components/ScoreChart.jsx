import { BarChart } from "@mui/x-charts/BarChart"
import Paper from "@mui/material/Paper"

export default function ScoreChart({ scores }) {
  if (!scores || scores.length === 0) return null

  const data = scores.map(s => ({
    symbol: s.symbol,
    score: +s.score.toFixed(4),
  }))

  return (
    <Paper sx={{ p: 2 }}>
      <BarChart
        dataset={data}
        xAxis={[{ scaleType: "band", dataKey: "symbol", tickLabelStyle: { angle: -45, textAnchor: "end", fontSize: 11 } }]}
        series={[{ dataKey: "score", label: "Score",
          colorMap: { type: "ordinal", colors: data.map(d => d.score >= 0 ? "#10b981" : "#ef4444") },
        }]}
        height={300}
        margin={{ bottom: 60 }}
      />
    </Paper>
  )
}
