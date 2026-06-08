import { useState } from "react"
import { api } from "../api"
import { BarChart } from "@mui/x-charts/BarChart"
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
import Chip from "@mui/material/Chip"
import Table from "@mui/material/Table"
import TableBody from "@mui/material/TableBody"
import TableCell from "@mui/material/TableCell"
import TableContainer from "@mui/material/TableContainer"
import TableHead from "@mui/material/TableHead"
import TableRow from "@mui/material/TableRow"

const AVAILABLE_FACTORS = ["perf30", "perf60", "perf90", "vol30", "vol60", "vol90", "price"]

export default function IntradayScoring() {
  const [universe, setUniverse] = useState("nifty50")
  const [limit, setLimit] = useState(20)
  const [interval, setInterval_] = useState("5m")
  const [topN, setTopN] = useState(10)
  const [formula, setFormula] = useState("perf60 - vol30")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  async function runScoring() {
    setLoading(true); setError(null)
    try {
      const data = await api.scoreIntraday({ universe, limit: Number(limit), interval, topN: Number(topN), formula })
      setResult(data)
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  function insertFactor(factor) {
    setFormula(prev => prev + (prev && !prev.endsWith(" ") ? " " : "") + factor)
  }

  const chartData = result?.results?.map(r => ({ symbol: r.symbol, score: r.score })) || []

  return (
    <Stack spacing={2.5}>
      {/* Page header */}
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.25 }}>Intraday Scorer</Typography>
        <Typography variant="body2" color="text.secondary">
          Score stocks using short-term (5-minute bar) momentum and volatility factors. Best used during market hours for same-day trading ideas.
        </Typography>
      </Box>

      <Paper sx={{ p: 2.5 }}>
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 2, alignItems: "flex-end" }}>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Universe</InputLabel>
            <Select value={universe} label="Universe" onChange={e => setUniverse(e.target.value)}>
              <MenuItem value="nifty50">NIFTY 50</MenuItem>
              <MenuItem value="nifty100">NIFTY 100</MenuItem>
              <MenuItem value="nifty200">NIFTY 200</MenuItem>
              <MenuItem value="nifty500">NIFTY 500</MenuItem>
            </Select>
          </FormControl>
          <TextField type="number" size="small" label="Limit"
            value={limit} onChange={e => setLimit(e.target.value)}
            inputProps={{ min: 5, max: 100 }} sx={{ width: 90 }} />
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Interval</InputLabel>
            <Select value={interval} label="Interval" onChange={e => setInterval_(e.target.value)}>
              <MenuItem value="1m">1 min</MenuItem>
              <MenuItem value="5m">5 min</MenuItem>
              <MenuItem value="15m">15 min</MenuItem>
            </Select>
          </FormControl>
          <TextField type="number" size="small" label="Top N"
            value={topN} onChange={e => setTopN(e.target.value)}
            inputProps={{ min: 3, max: 30 }} sx={{ width: 90 }} />
          <Button variant="contained" onClick={runScoring} disabled={loading}
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}>
            {loading ? "Scoring..." : "Score Intraday"}
          </Button>
        </Stack>
      </Paper>

      <Paper sx={{ p: 2.5 }}>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>Scoring Formula</Typography>
        <TextField
          fullWidth size="small" value={formula}
          onChange={e => setFormula(e.target.value)}
          placeholder="perf60 - vol30"
          slotProps={{ input: { sx: { fontFamily: "'JetBrains Mono', monospace" } } }}
        />
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.5, mt: 1 }}>
          {AVAILABLE_FACTORS.map(f => (
            <Chip key={f} label={f} size="small" variant="outlined"
              onClick={() => insertFactor(f)}
              sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.75rem", cursor: "pointer" }} />
          ))}
        </Stack>
      </Paper>

      {error && <Alert severity="error">{error}</Alert>}

      {result && (
        <Stack spacing={2.5}>
          <Typography variant="caption" color="text.secondary">
            Scored {result.total} symbols at {result.interval} interval · {result.scoredAt?.slice(0, 19)}
          </Typography>

          {chartData.length > 0 && (
            <Paper sx={{ p: 2.5 }}>
              <BarChart
                dataset={chartData}
                xAxis={[{ scaleType: "band", dataKey: "symbol", tickLabelStyle: { angle: -45, textAnchor: "end", fontSize: 11 } }]}
                series={[{ dataKey: "score", label: "Score",
                  colorMap: { type: "ordinal", colors: chartData.map(d => d.score >= 0 ? "#10b981" : "#ef4444") },
                }]}
                height={300}
                margin={{ bottom: 60 }}
              />
            </Paper>
          )}

          {result.results && (
            <Paper sx={{ p: 0 }}>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>#</TableCell><TableCell>Symbol</TableCell><TableCell>Score</TableCell>
                      <TableCell>30m Perf</TableCell><TableCell>60m Perf</TableCell><TableCell>90m Perf</TableCell>
                      <TableCell>30m Vol</TableCell><TableCell>60m Vol</TableCell><TableCell>Price</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {result.results.map((r, i) => (
                      <TableRow key={`${r.symbol}-${i}`}>
                        <TableCell sx={{ color: "text.secondary", width: 40 }}>{i + 1}</TableCell>
                        <TableCell sx={{ color: "primary.main", fontWeight: 600 }}>{r.symbol}</TableCell>
                        <TableCell sx={{ color: r.score >= 0 ? "success.main" : "error.main" }}>{r.score.toFixed(4)}</TableCell>
                        <TableCell sx={{ color: r.perf30 >= 0 ? "success.main" : "error.main" }}>{r.perf30 >= 0 ? "+" : ""}{r.perf30?.toFixed(2)}%</TableCell>
                        <TableCell sx={{ color: r.perf60 >= 0 ? "success.main" : "error.main" }}>{r.perf60 >= 0 ? "+" : ""}{r.perf60?.toFixed(2)}%</TableCell>
                        <TableCell sx={{ color: r.perf90 >= 0 ? "success.main" : "error.main" }}>{r.perf90 >= 0 ? "+" : ""}{r.perf90?.toFixed(2)}%</TableCell>
                        <TableCell>{r.vol30?.toFixed(2)}%</TableCell>
                        <TableCell>{r.vol60?.toFixed(2)}%</TableCell>
                        <TableCell>₹{r.price?.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}
        </Stack>
      )}
    </Stack>
  )
}
