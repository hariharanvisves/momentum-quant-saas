import { useState, useEffect } from "react"
import { api } from "../api"
import { PieChart } from "@mui/x-charts/PieChart"
import Box from "@mui/material/Box"
import Paper from "@mui/material/Paper"
import Typography from "@mui/material/Typography"
import Stack from "@mui/material/Stack"
import Button from "@mui/material/Button"
import TextField from "@mui/material/TextField"
import Alert from "@mui/material/Alert"
import CircularProgress from "@mui/material/CircularProgress"
import Grid from "@mui/material/Grid"
import Table from "@mui/material/Table"
import TableBody from "@mui/material/TableBody"
import TableCell from "@mui/material/TableCell"
import TableContainer from "@mui/material/TableContainer"
import TableHead from "@mui/material/TableHead"
import TableRow from "@mui/material/TableRow"
import IconButton from "@mui/material/IconButton"
import DeleteIcon from "@mui/icons-material/Delete"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"

const PIE_COLORS = ["#10b981","#3b82f6","#f59e0b","#ef4444","#8b5cf6","#ec4899","#14b8a6","#f97316","#06b6d4","#84cc16"]

export default function PortfolioDetail({ portfolioId, onBack }) {
  const [perf, setPerf] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ symbol: "", quantity: "", entry_price: "", entry_date: "" })
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => { loadPerformance() }, [portfolioId])

  async function loadPerformance() {
    setLoading(true); setError(null)
    try { const data = await api.getPortfolioPerformance(portfolioId); setPerf(data) }
    catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  async function handleAddHolding() {
    if (!addForm.symbol || !addForm.quantity || !addForm.entry_price) return
    try {
      await api.addHolding(portfolioId, {
        symbol: addForm.symbol.toUpperCase(), quantity: Number(addForm.quantity),
        entry_price: Number(addForm.entry_price),
        entry_date: addForm.entry_date || new Date().toISOString().slice(0, 10),
      })
      setAddForm({ symbol: "", quantity: "", entry_price: "", entry_date: "" })
      setShowAdd(false); loadPerformance()
    } catch (e) { setError(e.message) }
  }

  async function handleRemoveHolding(holdingId) {
    if (!confirm("Remove this holding?")) return
    try { await api.removeHolding(portfolioId, holdingId); loadPerformance() }
    catch (e) { setError(e.message) }
  }

  async function handleRefresh() {
    setRefreshing(true); setError(null)
    try {
      const data = await api.refreshPortfolioPrices(portfolioId)
      if (data.performance) setPerf(data.performance)
    } catch (e) { setError(e.message) } finally { setRefreshing(false) }
  }

  if (loading) return <Typography color="text.secondary" sx={{ p: 4, textAlign: "center" }}>Loading portfolio...</Typography>
  if (error && !perf) return <Alert severity="error">{error}</Alert>
  if (!perf) return null

  const pieData = (perf.allocation || []).filter(a => a.value > 0).map((a, i) => ({
    id: i, label: a.symbol, value: a.value, color: PIE_COLORS[i % PIE_COLORS.length],
  }))

  return (
    <Stack spacing={2.5}>
      <Stack direction="row" sx={{ gap: 2, alignItems: "center" }}>
        <Button variant="text" startIcon={<ArrowBackIcon />} onClick={onBack} sx={{ color: "text.secondary", mr: 1 }}>Back</Button>
        <Typography variant="h6" sx={{ flex: 1 }}>{perf.name}</Typography>
        <Button variant="outlined" onClick={handleRefresh} disabled={refreshing}
          startIcon={refreshing ? <CircularProgress size={14} /> : null}>
          {refreshing ? "Refreshing..." : "Refresh Prices"}
        </Button>
        <Button variant="contained" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? "Cancel" : "+ Add Holding"}
        </Button>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      <Grid container spacing={1.5}>
        {[
          { label: "Total Invested", value: `₹${perf.totalInvested?.toLocaleString()}`, color: "text.primary" },
          { label: "Current Value", value: `₹${perf.totalCurrent?.toLocaleString()}`, color: "text.primary" },
          { label: "Total P&L", value: `${perf.totalPnl >= 0 ? "+" : ""}₹${Math.abs(perf.totalPnl)?.toLocaleString()}`, color: perf.totalPnl >= 0 ? "success.main" : "error.main" },
          { label: "P&L %", value: `${perf.totalPnlPct >= 0 ? "+" : ""}${perf.totalPnlPct}%`, color: perf.totalPnlPct >= 0 ? "success.main" : "error.main" },
        ].map((m, i) => (
          <Grid item xs={6} sm={3} key={i}>
            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>{m.label}</Typography>
              <Typography variant="h6" sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "1.1rem", fontWeight: 600, color: m.color }}>{m.value}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {showAdd && (
        <Paper sx={{ p: 2.5 }}>
          <Stack direction="row" sx={{ flexWrap: "wrap", gap: 2, alignItems: "flex-end" }}>
            <TextField size="small" label="Symbol" placeholder="RELIANCE"
              value={addForm.symbol} onChange={e => setAddForm({ ...addForm, symbol: e.target.value })}
              sx={{ width: 140 }} slotProps={{ input: { sx: { fontFamily: "'JetBrains Mono', monospace" } } }} />
            <TextField type="number" size="small" label="Quantity"
              value={addForm.quantity} onChange={e => setAddForm({ ...addForm, quantity: e.target.value })}
              inputProps={{ min: 1 }} sx={{ width: 100 }} />
            <TextField type="number" size="small" label="Entry Price"
              value={addForm.entry_price} onChange={e => setAddForm({ ...addForm, entry_price: e.target.value })}
              inputProps={{ min: 0, step: 0.05 }} sx={{ width: 120 }} />
            <TextField type="date" size="small" label="Entry Date"
              value={addForm.entry_date} onChange={e => setAddForm({ ...addForm, entry_date: e.target.value })}
              InputLabelProps={{ shrink: true }} sx={{ width: 150 }} />
            <Button variant="contained" onClick={handleAddHolding}>Add</Button>
          </Stack>
        </Paper>
      )}

      {pieData.length > 0 && (
        <Paper sx={{ p: 2.5 }}>
          <Typography variant="subtitle2" gutterBottom>Allocation</Typography>
          <PieChart
            series={[{ data: pieData, innerRadius: 50, outerRadius: 110, arcLabel: item => item.label, arcLabelMinAngle: 30, valueFormatter: item => `₹${Math.round(item.value).toLocaleString()}` }]}
            height={300}
            slots={{ legend: () => null }}
            sx={{ '& .MuiChartsArcLabel-root': { fill: '#f1f5f9', fontSize: 12, fontFamily: "'Outfit', sans-serif", fontWeight: 600 } }}
          />
        </Paper>
      )}

      {perf.holdings && perf.holdings.length > 0 ? (
        <Paper sx={{ p: 0 }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Symbol</TableCell><TableCell>Qty</TableCell>
                  <TableCell>Entry</TableCell><TableCell>Current</TableCell>
                  <TableCell>Invested</TableCell><TableCell>Value</TableCell>
                  <TableCell>P&L</TableCell><TableCell>P&L %</TableCell><TableCell></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {perf.holdings.map(h => (
                  <TableRow key={h.id}>
                    <TableCell sx={{ color: "primary.main", fontWeight: 600 }}>{h.symbol}</TableCell>
                    <TableCell>{h.quantity}</TableCell>
                    <TableCell>₹{h.entry_price?.toFixed(2)}</TableCell>
                    <TableCell>₹{(h.current_price || h.entry_price)?.toFixed(2)}</TableCell>
                    <TableCell>₹{h.investedValue?.toLocaleString()}</TableCell>
                    <TableCell>₹{Math.round(h.current_value || h.investedValue)?.toLocaleString()}</TableCell>
                    <TableCell sx={{ color: h.pnl >= 0 ? "success.main" : "error.main" }}>
                      {h.pnl >= 0 ? "+" : ""}₹{Math.round(Math.abs(h.pnl || 0)).toLocaleString()}
                    </TableCell>
                    <TableCell sx={{ color: h.pnl_pct >= 0 ? "success.main" : "error.main" }}>
                      {h.pnl_pct >= 0 ? "+" : ""}{(h.pnl_pct || 0).toFixed(2)}%
                    </TableCell>
                    <TableCell>
                      <IconButton size="small" color="error" onClick={() => handleRemoveHolding(h.id)} aria-label={`Remove holding ${h.symbol}`} title="Remove holding">
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      ) : (
        <Typography color="text.secondary" sx={{ p: 4, textAlign: "center" }}>
          No holdings yet. Add stocks to track your portfolio.
        </Typography>
      )}
    </Stack>
  )
}
