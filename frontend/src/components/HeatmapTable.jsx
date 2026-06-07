import Box from "@mui/material/Box"
import Paper from "@mui/material/Paper"
import Typography from "@mui/material/Typography"
import Table from "@mui/material/Table"
import TableBody from "@mui/material/TableBody"
import TableCell from "@mui/material/TableCell"
import TableHead from "@mui/material/TableHead"
import TableRow from "@mui/material/TableRow"

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

function getCellColor(pct) {
  if (pct === null || pct === undefined) return "transparent"
  if (pct >= 8) return "rgba(16, 185, 129, 0.6)"
  if (pct >= 4) return "rgba(16, 185, 129, 0.4)"
  if (pct >= 2) return "rgba(16, 185, 129, 0.25)"
  if (pct >= 0) return "rgba(16, 185, 129, 0.1)"
  if (pct >= -2) return "rgba(239, 68, 68, 0.1)"
  if (pct >= -4) return "rgba(239, 68, 68, 0.25)"
  if (pct >= -8) return "rgba(239, 68, 68, 0.4)"
  return "rgba(239, 68, 68, 0.6)"
}

export default function HeatmapTable({ monthlyReturns }) {
  if (!monthlyReturns || monthlyReturns.length === 0) return null

  const years = [...new Set(monthlyReturns.map(m => m.year))].sort()
  const lookup = {}
  for (const m of monthlyReturns) { lookup[`${m.year}-${m.month}`] = m }

  const yearlyTotals = {}
  for (const year of years) {
    const entries = monthlyReturns.filter(m => m.year === year)
    if (!entries.length) continue
    const firstStart = entries[0].startValue
    const lastEnd = entries[entries.length - 1].endValue
    yearlyTotals[year] = firstStart > 0 ? +((lastEnd - firstStart) / firstStart * 100).toFixed(2) : 0
  }

  const cellSx = {
    padding: "4px 6px",
    textAlign: "center",
    border: "1px solid rgba(30,41,59,0.3)",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "0.75rem",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  }

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="subtitle2" gutterBottom>Monthly P&L Heatmap</Typography>
      <Box sx={{ overflowX: "auto" }}>
        <Table size="small" sx={{ whiteSpace: "nowrap", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.75rem" }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ ...cellSx, color: "text.secondary", fontWeight: 500, borderBottom: "1px solid", borderColor: "divider" }}>Year</TableCell>
              {MONTH_LABELS.map(m => <TableCell key={m} sx={{ ...cellSx, color: "text.secondary", fontWeight: 500, borderBottom: "1px solid", borderColor: "divider" }}>{m}</TableCell>)}
              <TableCell sx={{ ...cellSx, color: "text.secondary", fontWeight: 500, borderBottom: "1px solid", borderColor: "divider" }}>Annual</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {years.map(year => (
              <TableRow key={year}>
                <TableCell sx={{ ...cellSx, fontWeight: 600, color: "text.secondary" }}>{year}</TableCell>
                {[1,2,3,4,5,6,7,8,9,10,11,12].map(month => {
                  const entry = lookup[`${year}-${month}`]
                  if (!entry) return <TableCell key={month} sx={{ ...cellSx, color: "text.secondary", opacity: 0.3 }}>-</TableCell>
                  return (
                    <TableCell key={month} sx={{ ...cellSx, background: getCellColor(entry.returnPct) }}
                      title={`${MONTH_LABELS[month-1]} ${year}: ${entry.returnPct}%`}>
                      <Box component="span" sx={{ color: entry.returnPct >= 0 ? "success.main" : "error.main" }}>
                        {entry.returnPct >= 0 ? "+" : ""}{entry.returnPct}%
                      </Box>
                    </TableCell>
                  )
                })}
                <TableCell sx={{ ...cellSx, background: getCellColor(yearlyTotals[year]), fontWeight: 600, borderLeft: "2px solid", borderColor: "divider" }}>
                  <Box component="span" sx={{ color: yearlyTotals[year] >= 0 ? "success.main" : "error.main" }}>
                    {yearlyTotals[year] >= 0 ? "+" : ""}{yearlyTotals[year]}%
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </Paper>
  )
}
