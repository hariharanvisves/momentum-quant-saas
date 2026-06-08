import { useState } from "react"
import { api } from "../api"
import Box from "@mui/material/Box"
import Paper from "@mui/material/Paper"
import Typography from "@mui/material/Typography"
import Stack from "@mui/material/Stack"
import Button from "@mui/material/Button"
import FormControl from "@mui/material/FormControl"
import InputLabel from "@mui/material/InputLabel"
import Select from "@mui/material/Select"
import MenuItem from "@mui/material/MenuItem"
import TextField from "@mui/material/TextField"
import Alert from "@mui/material/Alert"
import CircularProgress from "@mui/material/CircularProgress"
import LinearProgress from "@mui/material/LinearProgress"
import Grid from "@mui/material/Grid"
import Table from "@mui/material/Table"
import TableBody from "@mui/material/TableBody"
import TableCell from "@mui/material/TableCell"
import TableContainer from "@mui/material/TableContainer"
import TableHead from "@mui/material/TableHead"
import TableRow from "@mui/material/TableRow"

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
    <Stack spacing={2.5}>
      {/* Page header */}
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.25 }}>Strategy Optimizer</Typography>
        <Typography variant="body2" color="text.secondary">
          Grid-search over combinations of Top N, rebalance frequency, and lookback periods. Finds the parameter set with the best Sharpe ratio.
        </Typography>
      </Box>

      <Paper sx={{ p: 2.5 }}>
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 2, alignItems: "flex-end" }}>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Universe</InputLabel>
            <Select value={universe} label="Universe" onChange={e => setUniverse(e.target.value)}>
              <MenuItem value="nifty50">NIFTY 50</MenuItem>
              <MenuItem value="nifty100">NIFTY 100</MenuItem>
            </Select>
          </FormControl>
          <TextField
            type="number" size="small" label="Symbols"
            value={symbolLimit} onChange={e => setSymbolLimit(e.target.value)}
            inputProps={{ min: 5, max: 50 }} sx={{ width: 100 }}
          />
          <Button
            variant="contained" onClick={runOptimizer} disabled={loading}
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}
            sx={{ px: 3 }}
          >
            {loading ? "Optimizing…" : "Run Optimizer"}
          </Button>
        </Stack>
        {!loading && !result && (
          <Box sx={{ mt: 2, p: 1.5, bgcolor: "rgba(59,130,246,0.06)", borderRadius: 2, border: "1px solid rgba(59,130,246,0.12)" }}>
            <Typography variant="caption" color="text.secondary">
              ⚠️ The optimizer runs dozens of backtests — expect 2–5 minutes for NIFTY 100.
            </Typography>
          </Box>
        )}
      </Paper>

      {loading && (
        <Box>
          <Alert severity="info" icon={<CircularProgress size={16} />} sx={{ mb: 1 }}>
            Optimizer runs many backtests — this takes a while...
          </Alert>
          <LinearProgress />
        </Box>
      )}
      {error && <Alert severity="error">{error}</Alert>}

      {result && (
        <Stack spacing={2.5}>
          {result.best && (
            <Paper sx={{ p: 2, border: "1px solid", borderColor: "primary.main" }}>
              <Typography variant="subtitle1" gutterBottom>Best Parameters (by Sharpe)</Typography>
              <Grid container spacing={1.5} sx={{ mb: 1 }}>
                {[
                  { label: "Top N", value: result.best.topN },
                  { label: "Rebal Freq", value: `${result.best.rebalanceFrequency}d` },
                  { label: "Sharpe", value: result.best.sharpe },
                  { label: "CAGR", value: `${result.best.cagr}%` },
                ].map((m, i) => (
                  <Grid item xs={6} sm={3} key={i}>
                    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        {m.label}
                      </Typography>
                      <Typography variant="h6" sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "1.1rem", fontWeight: 600 }}>
                        {m.value}
                      </Typography>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
              <Typography variant="caption" color="text.secondary">
                Lookbacks: [{result.best.lookbacks.join(", ")}]
              </Typography>
            </Paper>
          )}

          <Paper sx={{ p: 0 }}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Top N</TableCell>
                    <TableCell>Rebal</TableCell>
                    <TableCell>Lookbacks</TableCell>
                    <TableCell>Sharpe</TableCell>
                    <TableCell>CAGR</TableCell>
                    <TableCell>Max DD</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {result.results.slice(0, 20).map((r, i) => (
                    <TableRow key={i} sx={i === 0 ? { backgroundColor: "rgba(59,130,246,0.08)" } : {}}>
                      <TableCell>{r.topN}</TableCell>
                      <TableCell>{r.rebalanceFrequency}d</TableCell>
                      <TableCell>[{r.lookbacks.join(",")}]</TableCell>
                      <TableCell>{r.sharpe}</TableCell>
                      <TableCell>{r.cagr}%</TableCell>
                      <TableCell>{r.maxDrawdown}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
          <Typography variant="caption" color="text.secondary">
            {result.combinationsTested}/{result.totalCombinations} tested
          </Typography>
        </Stack>
      )}
    </Stack>
  )
}

