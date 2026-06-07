import { LineChart } from "@mui/x-charts/LineChart"
import Paper from "@mui/material/Paper"
import Typography from "@mui/material/Typography"

export default function DrawdownChart({ drawdownCurve }) {
  if (!drawdownCurve || drawdownCurve.length === 0) return null

  const hasBenchmark = drawdownCurve.some(d => d.benchmarkDD != null)

  const series = [
    { dataKey: "portfolioDD", label: "Portfolio DD", color: "#ef4444", showMark: false, curve: "monotoneX" },
    ...(hasBenchmark ? [{ dataKey: "benchmarkDD", label: "Benchmark DD", color: "#94a3b8", showMark: false, curve: "monotoneX" }] : []),
  ]

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="subtitle2" gutterBottom>Drawdown Comparison</Typography>
      <LineChart
        dataset={drawdownCurve}
        xAxis={[{ dataKey: "date", scaleType: "point", valueFormatter: d => d.slice(0, 7), tickLabelStyle: { fontSize: 11 } }]}
        yAxis={[{ reverse: true, valueFormatter: v => `-${v}%` }]}
        series={series}
        height={250}
        slotProps={{ legend: { direction: "row", position: { vertical: "bottom", horizontal: "middle" }, padding: 0 } }}
      />
    </Paper>
  )
}
