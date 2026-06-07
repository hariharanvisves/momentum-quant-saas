import { useState, useMemo } from "react"
import { BarChart } from "@mui/x-charts/BarChart"
import { PieChart } from "@mui/x-charts/PieChart"
import Box from "@mui/material/Box"
import Paper from "@mui/material/Paper"
import Typography from "@mui/material/Typography"
import Stack from "@mui/material/Stack"
import TextField from "@mui/material/TextField"
import Grid from "@mui/material/Grid"

function formatInr(n) {
  if (!Number.isFinite(n)) return "0"
  const abs = Math.abs(n)
  const sign = n < 0 ? "-" : ""
  if (abs >= 10000000) return `${sign}${(abs / 10000000).toFixed(2)} Cr`
  if (abs >= 100000) return `${sign}${(abs / 100000).toFixed(2)} L`
  return `${sign}${abs.toLocaleString()}`
}

export default function SipCalculator() {
  const [startingAmount, setStartingAmount] = useState(100000)
  const [monthlySip, setMonthlySip] = useState(25000)
  const [yearlyIncrement, setYearlyIncrement] = useState(10)
  const [expectedCagr, setExpectedCagr] = useState(15)
  const [years, setYears] = useState(10)

  const result = useMemo(() => {
    const safeYears = Math.max(1, Math.min(40, Number(years) || 1))
    const safeCagr = Math.max(0, Math.min(100, Number(expectedCagr) || 0))
    const safeSip = Math.max(0, Number(monthlySip) || 0)
    const safeStart = Math.max(0, Number(startingAmount) || 0)
    const safeIncrement = Math.max(0, Math.min(100, Number(yearlyIncrement) || 0))
    const monthlyRate = safeCagr / 100 / 12
    let totalInvested = safeStart
    let futureValue = safeStart
    let currentSip = safeSip
    const yearlyData = []
    for (let year = 1; year <= safeYears; year++) {
      for (let month = 1; month <= 12; month++) {
        futureValue = (futureValue + currentSip) * (1 + monthlyRate)
        totalInvested += currentSip
      }
      yearlyData.push({ year: `Y${year}`, invested: Math.round(totalInvested), value: Math.round(futureValue) })
      currentSip = Math.round(currentSip * (1 + safeIncrement / 100))
    }
    const totalGains = futureValue - totalInvested
    return { totalInvested: Math.round(totalInvested), futureValue: Math.round(futureValue), totalGains: Math.round(totalGains), gainsPct: totalInvested > 0 ? +((totalGains / totalInvested) * 100).toFixed(1) : 0, yearlyData }
  }, [startingAmount, monthlySip, yearlyIncrement, expectedCagr, years])

  const donutData = [
    { id: 0, label: "Invested", value: result.totalInvested, color: "#3b82f6" },
    { id: 1, label: "Gains", value: Math.max(0, result.totalGains), color: "#10b981" },
  ]

  return (
    <Stack spacing={2.5}>
      {/* Page header */}
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.25 }}>SIP Calculator</Typography>
        <Typography variant="body2" color="text.secondary">
          Project the future value of a monthly SIP with optional step-up. Adjust CAGR to model different market scenarios.
        </Typography>
      </Box>

      <Paper sx={{ p: 2.5 }}>
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 2, alignItems: "flex-end" }}>
          <TextField type="number" size="small" label="Starting Amount"
            value={startingAmount} onChange={e => setStartingAmount(Number(e.target.value))}
            inputProps={{ min: 0, step: 10000 }} sx={{ width: 150 }} />
          <TextField type="number" size="small" label="Monthly SIP"
            value={monthlySip} onChange={e => setMonthlySip(Number(e.target.value))}
            inputProps={{ min: 0, step: 5000 }} sx={{ width: 130 }} />
          <TextField type="number" size="small" label="Yearly Increment %"
            value={yearlyIncrement} onChange={e => setYearlyIncrement(Number(e.target.value))}
            inputProps={{ min: 0, max: 50 }} sx={{ width: 130 }} />
          <TextField type="number" size="small" label="Expected CAGR %"
            value={expectedCagr} onChange={e => setExpectedCagr(Number(e.target.value))}
            inputProps={{ min: 1, max: 50 }} sx={{ width: 130 }} />
          <TextField type="number" size="small" label="Years"
            value={years} onChange={e => setYears(Number(e.target.value))}
            inputProps={{ min: 1, max: 40 }} sx={{ width: 90 }} />
        </Stack>
      </Paper>

      <Grid container spacing={1.5}>
        {[
          { label: "Total Invested", value: `₹${formatInr(result.totalInvested)}`, color: "text.primary" },
          { label: "Expected Returns", value: `+₹${formatInr(result.totalGains)}`, color: "success.main" },
          { label: "Total Value", value: `₹${formatInr(result.futureValue)}`, color: "text.primary" },
          { label: "Gain %", value: `+${result.gainsPct}%`, color: "success.main" },
        ].map((m, i) => (
          <Grid item xs={6} sm={3} key={i}>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2,
              borderColor: m.color === "success.main" ? "rgba(16,185,129,0.2)" : "rgba(255,255,255,0.07)",
              backgroundColor: m.color === "success.main" ? "rgba(16,185,129,0.04)" : "transparent",
            }}>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5, fontSize: "0.72rem", letterSpacing: "0.03em" }}>
                {m.label}
              </Typography>
              <Typography sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "1.15rem", fontWeight: 700, color: m.color, lineHeight: 1.2 }}>
                {m.value}
              </Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Paper sx={{ p: 2.5 }}>
        <Typography variant="subtitle2" gutterBottom>Investment vs Value by Year</Typography>
        <BarChart
          dataset={result.yearlyData}
          xAxis={[{ scaleType: "band", dataKey: "year", tickLabelStyle: { fontSize: 11 } }]}
          yAxis={[{ valueFormatter: v => {
            const abs = Math.abs(v)
            if (abs >= 10000000) return `${(abs/10000000).toFixed(1)}Cr`
            if (abs >= 100000) return `${(abs/100000).toFixed(0)}L`
            return String(Math.round(abs))
          } }]}
          series={[
            { dataKey: "invested", label: "Invested", color: "#3b82f6" },
            { dataKey: "value", label: "Future Value", color: "#10b981" },
          ]}
          height={320}
          margin={{ left: 64, bottom: 48, top: 16, right: 16 }}
          slotProps={{ legend: { direction: "row", position: { vertical: "bottom", horizontal: "middle" }, padding: 0 } }}
        />
      </Paper>

      <Grid container spacing={2}>
        <Grid item xs={12} sm={5}>
          <Paper sx={{ p: 2.5 }}>
            <Typography variant="subtitle2" gutterBottom>Invested vs Gains</Typography>
            <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
              <PieChart
                series={[{
                  data: donutData,
                  innerRadius: 55,
                  outerRadius: 100,
                  arcLabel: item => `${item.label}`,
                  arcLabelMinAngle: 45,
                  valueFormatter: item => `₹${item.value.toLocaleString()}`,
                }]}
                width={280}
                height={280}
                slots={{ legend: () => null }}
                sx={{ '& .MuiChartsArcLabel-root': { fill: '#f1f5f9', fontSize: 13, fontFamily: "'Outfit', sans-serif", fontWeight: 600 } }}
              />
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Stack>
  )
}
