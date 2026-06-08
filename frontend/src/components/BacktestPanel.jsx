import { useState, useEffect, useMemo, useRef, Fragment } from "react"
import { createChart, LineStyle } from "lightweight-charts"
import { api } from "../api"
import HeatmapTable from "./HeatmapTable"
import DrawdownChart from "./DrawdownChart"
import PresetCards from "./PresetCards"
import FormulaInput from "./FormulaInput"
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
import FormControlLabel from "@mui/material/FormControlLabel"
import Switch from "@mui/material/Switch"
import Alert from "@mui/material/Alert"
import CircularProgress from "@mui/material/CircularProgress"
import LinearProgress from "@mui/material/LinearProgress"
import Grid from "@mui/material/Grid"
import Tabs from "@mui/material/Tabs"
import Tab from "@mui/material/Tab"
import Table from "@mui/material/Table"
import TableBody from "@mui/material/TableBody"
import TableCell from "@mui/material/TableCell"
import TableContainer from "@mui/material/TableContainer"
import TableRow from "@mui/material/TableRow"
import Card from "@mui/material/Card"
import CardActionArea from "@mui/material/CardActionArea"
import CardContent from "@mui/material/CardContent"
import Dialog from "@mui/material/Dialog"
import DialogTitle from "@mui/material/DialogTitle"
import DialogContent from "@mui/material/DialogContent"
import List from "@mui/material/List"
import ListItemButton from "@mui/material/ListItemButton"
import ListItemText from "@mui/material/ListItemText"

const REBAL_OPTIONS = [
  { value: 5, label: "Weekly" },
  { value: 21, label: "Monthly" },
  { value: 63, label: "Quarterly" },
  { value: 252, label: "Yearly" },
]

const SAMPLE_STRATEGIES = [
  { name: "6M Perf / 6M Vol", formula: "6 Month Performance / 6 Month Volatility" },
  { name: "12M Momentum", formula: "12 Month Performance" },
  { name: "Risk-Adjusted 3M", formula: "3 Month Performance / 3 Month Volatility" },
  { name: "Multi-Period", formula: "(6 Month Performance + 12 Month Performance) / 6 Month Volatility" },
]

function EquityChart({ chartData }) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current || chartData.length === 0) return

    const chart = createChart(containerRef.current, {
      width: containerRef.current.offsetWidth,
      height: 350,
      layout: { background: { color: "#0f1623" }, textColor: "#64748b" },
      grid: { vertLines: { color: "rgba(255,255,255,0.04)" }, horzLines: { color: "rgba(255,255,255,0.04)" } },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.07)" },
      timeScale: { borderColor: "rgba(255,255,255,0.07)" },
    })
    chartRef.current = chart

    const portfolioSeries = chart.addAreaSeries({
      lineColor: "#10b981",
      topColor: "rgba(16,185,129,0.2)",
      bottomColor: "rgba(0,0,0,0)",
      lineWidth: 2,
      title: "Momentum Portfolio",
    })
    portfolioSeries.setData(
      chartData.map(p => ({ time: p.date, value: p.portfolio }))
    )

    const benchmarkPoints = chartData.filter(p => p.benchmark !== null)
    if (benchmarkPoints.length > 0) {
      const benchmarkSeries = chart.addLineSeries({
        color: "#f59e0b",
        lineWidth: 1.5,
        lineStyle: LineStyle.Dashed,
        title: "Benchmark (NIFTY)",
      })
      benchmarkSeries.setData(
        benchmarkPoints.map(p => ({ time: p.date, value: p.benchmark }))
      )
    }

    chart.timeScale().fitContent()

    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.offsetWidth })
      }
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null }
    }
  }, [chartData])

  return <div ref={containerRef} style={{ height: 350, width: "100%" }} />
}

export default function BacktestPanel() {
  const [universe, setUniverse] = useState("nifty50")
  const [initialCapital, setInitialCapital] = useState(1000000)
  const [topN, setTopN] = useState(10)
  const [exitRank, setExitRank] = useState(52)
  const [rebalFreq, setRebalFreq] = useState(21)
  const [symbolLimit, setSymbolLimit] = useState(50)
  const [startDate, setStartDate] = useState("2018-01-01")
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10))
  const [strategyName, setStrategyName] = useState("")
  const [formula, setFormula] = useState("6 Month Performance / 6 Month Volatility")
  const [regimeEnabled, setRegimeEnabled] = useState(false)
  const [regimePeriod, setRegimePeriod] = useState(10)
  const [regimeMultiplier, setRegimeMultiplier] = useState(3)
  const [regimeAction, setRegimeAction] = useState("half_portfolio")
  const [uncorrelatedEnabled, setUncorrelatedEnabled] = useState(false)
  const [uncorrelatedSymbol, setUncorrelatedSymbol] = useState("GOLDBEES")
  const [strategies, setStrategies] = useState([])
  const [selectedStrategy, setSelectedStrategy] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [activeResultTab, setActiveResultTab] = useState("result")
  const [savedResult, setSavedResult] = useState(null)
  const [loadDialogOpen, setLoadDialogOpen] = useState(false)
  const [previousBacktests, setPreviousBacktests] = useState([])

  useEffect(() => {
    api.getStrategies().then(data => setStrategies(data.strategies || [])).catch(() => {})
  }, [])

  function loadStrategy(id) {
    const strat = strategies.find(s => String(s.id) === String(id))
    if (strat) { setFormula(strat.formula); setStrategyName(strat.name); setSelectedStrategy(id) }
  }

  function clearForm() {
    setFormula(""); setStrategyName(""); setResult(null); setError(null)
    setSelectedStrategy(""); setRegimeEnabled(false); setUncorrelatedEnabled(false)
  }

  function handlePresetSelect(preset) {
    setUniverse(preset.universe || "nifty50")
    setSymbolLimit(preset.symbolLimit || 50)
    setTopN(preset.topN || 10)
    setRebalFreq(preset.rebalanceFrequency || 21)
    if (preset.initialCapital) setInitialCapital(preset.initialCapital)
    if (preset.formula) setFormula(preset.formula)
  }

  async function runBacktest() {
    setLoading(true); setError(null)
    try {
      const params = {
        universe, symbolLimit: Number(symbolLimit), topN: Number(topN),
        rebalanceFrequency: Number(rebalFreq), startDate, endDate,
        initialCapital: Number(initialCapital),
      }
      if (formula.trim()) params.formula = formula.trim()
      if (exitRank && Number(exitRank) > 0) params.exitRank = Number(exitRank)
      if (regimeEnabled) params.regimeFilter = {
        enabled: true, period: Number(regimePeriod),
        multiplier: Number(regimeMultiplier), action: regimeAction,
      }
      if (uncorrelatedEnabled) params.uncorrelatedAsset = { enabled: true, symbol: uncorrelatedSymbol }
      const data = await api.backtest(params)
      setResult(data); setActiveResultTab("result")
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function downloadResults() {
    if (!result) return
    const rows = [
      ["Metric", "Value"],
      ["Universe", result.universe], ["Start Date", result.startDate], ["End Date", result.endDate],
      ["Initial Capital", result.investedCapital || result.initialCapital],
      ["Final Value", result.finalValue], ["Total Return %", result.totalReturn],
      ["CAGR %", result.cagr], ["Sharpe Ratio", result.sharpe],
      ["Max Drawdown %", result.maxDrawdown],
    ]
    const csv = rows.map(r => r.join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a"); a.href = url
    a.download = `backtest-${result.universe}-${result.startDate}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const benchMap = useMemo(() => {
    const m = new Map()
    result?.benchmarkCurve?.forEach(b => m.set(b.date, b.value))
    return m
  }, [result])

  const chartData = result?.equityCurve?.map(point => ({
    date: point.date,
    portfolio: point.value,
    benchmark: benchMap.get(point.date) ?? null,
  })) || []

  const metrics = result ? [
    { label: "Invested Capital", value: `₹${(result.investedCapital || 0).toLocaleString()}`, color: "text.primary" },
    { label: "Current Capital", value: `₹${(result.finalValue || 0).toLocaleString()}`, color: (result.finalValue || 0) >= (result.investedCapital || 0) ? "success.main" : "error.main" },
    { label: "Total Return", value: `${result.totalReturn}%`, color: result.totalReturn >= 0 ? "success.main" : "error.main" },
    { label: "CAGR", value: `${result.cagr}%`, color: result.cagr >= 0 ? "success.main" : "error.main" },
    { label: "Win Rate", value: result.winRate != null ? `${result.winRate}%` : "N/A", color: (result.winRate ?? 0) >= 50 ? "success.main" : "error.main" },
    { label: "Avg Winners ROI", value: result.avgWinnersROI != null ? `${result.avgWinnersROI}%` : "N/A", color: "success.main" },
    { label: "Avg Losers ROI", value: result.avgLosersROI != null ? `${result.avgLosersROI}%` : "N/A", color: "error.main" },
    { label: "Best Trade", value: result.biggestWinnerROI != null ? `${result.biggestWinnerROI}%` : "N/A", color: "success.main" },
    { label: "Worst Trade", value: result.biggestLoserROI != null ? `${result.biggestLoserROI}%` : "N/A", color: "error.main" },
    { label: "Risk:Reward", value: result.riskToReward ?? "N/A", color: "text.primary" },
    { label: "Max Drawdown", value: `${result.maxDrawdown}%`, color: "error.main" },
    { label: "Sharpe Ratio", value: `${result.sharpe}`, color: result.sharpe >= 1 ? "success.main" : "text.primary" },
  ] : []

  return (
    <Stack spacing={2.5}>
      {/* Page header */}
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.25 }}>Strategy Backtester</Typography>
        <Typography variant="body2" color="text.secondary">
          Simulate how a momentum strategy would have performed historically. Configure your portfolio rules, pick a scoring formula, and run.
        </Typography>
      </Box>

      {/* Portfolio Rules */}
      <Paper sx={{ p: 2.5 }}>
        <Typography variant="subtitle1" gutterBottom>Portfolio Rules</Typography>
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 2, alignItems: "flex-start" }}>
          <TextField type="number" size="small" label="Starting Capital"
            value={initialCapital} onChange={e => setInitialCapital(e.target.value)}
            inputProps={{ min: 100000, step: 100000 }} sx={{ width: 160 }}
            slotProps={{
              input: {
                startAdornment: <Box component="span" sx={{ color: "text.secondary", mr: 0.25, fontFamily: "'Outfit', sans-serif", fontSize: "0.85rem" }}>₹</Box>,
                sx: { fontFamily: "'JetBrains Mono', monospace" },
              },
            }}
          />
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Universe</InputLabel>
            <Select value={universe} label="Universe" onChange={e => setUniverse(e.target.value)}>
              {["nifty50","nifty100","nifty200","nifty250","nifty500"].map(u =>
                <MenuItem key={u} value={u}>{u.replace("nifty","NIFTY ")}</MenuItem>
              )}
            </Select>
          </FormControl>
          <TextField type="number" size="small" label="Symbol Limit"
            value={symbolLimit} onChange={e => setSymbolLimit(e.target.value)}
            inputProps={{ min: 5, max: 500 }} sx={{ width: 110 }} />
          <TextField type="number" size="small" label="Stocks in Portfolio"
            value={topN} onChange={e => setTopN(e.target.value)}
            inputProps={{ min: 1, max: 50 }} sx={{ width: 130 }} />
          <TextField type="number" size="small" label="Exit Rank"
            value={exitRank} onChange={e => setExitRank(e.target.value)}
            inputProps={{ min: 0, max: 500 }}
            title="FRR: sell held stock if rank drops below this. 0 = full replacement."
            sx={{ width: 100 }} />
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Rebalance</InputLabel>
            <Select value={rebalFreq} label="Rebalance" onChange={e => setRebalFreq(e.target.value)}>
              {REBAL_OPTIONS.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
            </Select>
          </FormControl>
        </Stack>
      </Paper>

      {/* Regime Filter */}
      <Paper sx={{ p: 2.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: regimeEnabled ? 1.5 : 0 }}>
          <Typography variant="subtitle1">Regime Filter</Typography>
          <FormControlLabel
            control={<Switch size="small" checked={regimeEnabled} onChange={e => { setRegimeEnabled(e.target.checked); if (!e.target.checked) setUncorrelatedEnabled(false) }} />}
            label={<Typography variant="body2">Enable</Typography>}
          />
        </Box>
        {regimeEnabled && (
          <Stack spacing={1.5}>
            <Stack direction="row" sx={{ flexWrap: "wrap", gap: 2, alignItems: "flex-end" }}>
              <FormControl size="small" sx={{ minWidth: 140 }} disabled>
                <InputLabel>Indicator</InputLabel>
                <Select value="supertrend" label="Indicator"><MenuItem value="supertrend">Supertrend</MenuItem></Select>
              </FormControl>
              <TextField type="number" size="small" label="Period"
                value={regimePeriod} onChange={e => setRegimePeriod(e.target.value)}
                inputProps={{ min: 1, max: 50 }} sx={{ width: 90 }} />
              <TextField type="number" size="small" label="Multiplier"
                value={regimeMultiplier} onChange={e => setRegimeMultiplier(e.target.value)}
                inputProps={{ min: 0.5, max: 10, step: 0.5 }} sx={{ width: 100 }} />
              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel>Bearish Action</InputLabel>
                <Select value={regimeAction} label="Bearish Action" onChange={e => setRegimeAction(e.target.value)}>
                  <MenuItem value="half_portfolio">Half Portfolio</MenuItem>
                  <MenuItem value="quarter_portfolio">Quarter Portfolio</MenuItem>
                  <MenuItem value="exit_all">Exit All</MenuItem>
                </Select>
              </FormControl>
            </Stack>
            <Box sx={{ borderTop: "1px solid", borderColor: "divider", pt: 1.5 }}>
              <FormControlLabel
                control={<Switch size="small" checked={uncorrelatedEnabled} onChange={e => setUncorrelatedEnabled(e.target.checked)} />}
                label={<Typography variant="body2">Park freed capital in uncorrelated asset</Typography>}
              />
              {uncorrelatedEnabled && (
                <FormControl size="small" sx={{ mt: 1, minWidth: 200 }}>
                  <InputLabel>Asset</InputLabel>
                  <Select value={uncorrelatedSymbol} label="Asset" onChange={e => setUncorrelatedSymbol(e.target.value)}>
                    <MenuItem value="GOLDBEES">Gold ETF (GOLDBEES)</MenuItem>
                    <MenuItem value="LIQUIDBEES">Liquid ETF (LIQUIDBEES)</MenuItem>
                    <MenuItem value="CPSEETF">CPSE ETF</MenuItem>
                    <MenuItem value="NIFTYBEES">NIFTY ETF (NIFTYBEES)</MenuItem>
                  </Select>
                </FormControl>
              )}
            </Box>
          </Stack>
        )}
      </Paper>

      {/* Portfolio Settings */}
      <Paper sx={{ p: 2.5 }}>
        <Typography variant="subtitle1" gutterBottom>Portfolio Settings</Typography>
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 2, alignItems: "flex-end" }}>
          <TextField size="small" label="Strategy Name" placeholder="My Strategy"
            value={strategyName} onChange={e => setStrategyName(e.target.value)}
            sx={{ width: 180 }}
            slotProps={{ input: { sx: { fontFamily: "'Outfit', sans-serif" } } }} />
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Previous Strategy</InputLabel>
            <Select value={selectedStrategy} label="Previous Strategy" onChange={e => loadStrategy(e.target.value)}>
              <MenuItem value="">-- Select --</MenuItem>
              {strategies.map(s => <MenuItem key={s.id} value={String(s.id)}>{s.name}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField type="date" size="small" label="Start Date"
            value={startDate} onChange={e => setStartDate(e.target.value)}
            InputLabelProps={{ shrink: true }} sx={{ width: 160 }} />
          <TextField type="date" size="small" label="End Date"
            value={endDate} onChange={e => setEndDate(e.target.value)}
            InputLabelProps={{ shrink: true }} sx={{ width: 160 }} />
          <Button variant="outlined" size="small" onClick={async () => {
            try {
              const data = await api.getBacktests()
              setPreviousBacktests(data.results || [])
              setLoadDialogOpen(true)
            } catch (e) {}
          }}>
            Load Previous
          </Button>
        </Stack>
      </Paper>

      {/* Scoring Console */}
      <Paper sx={{ p: 2.5 }}>
        <Typography variant="subtitle1" gutterBottom>Scoring Console</Typography>
        <FormulaInput multiline value={formula} onChange={setFormula}
          placeholder="e.g. 6 Month Performance / 6 Month Volatility" rows={3} />
        <Stack direction="row" sx={{ gap: 1.5, mt: 1.5 }}>
          <Button variant="contained" onClick={runBacktest} disabled={loading}
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}>
            {loading ? "Running Backtest..." : "Backtest"}
          </Button>
          <Button variant="outlined" onClick={clearForm}>Clear</Button>
        </Stack>
      </Paper>

      {loading && (
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
            Running backtest simulation — this may take a few minutes...
          </Typography>
          <LinearProgress />
        </Box>
      )}
      {error && <Alert severity="error">{error}</Alert>}

      {!result && !loading && <PresetCards onSelect={handlePresetSelect} />}

      {result && (
        <Box>
          <Tabs
            value={activeResultTab}
            onChange={(_, v) => setActiveResultTab(v)}
            indicatorColor="primary" textColor="primary"
            sx={{ mb: 2, borderBottom: "1px solid", borderColor: "divider" }}
          >
            <Tab value="result" label="Backtest Result" />
            <Tab value="config" label="Backtest Config" />
          </Tabs>

          {activeResultTab === "result" && (
            <Stack spacing={2.5}>
              {/* Metrics */}
              <Paper sx={{ p: 2.5 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
                  <Typography variant="subtitle1">Overall Performance</Typography>
                  <Box sx={{ display: "flex", gap: 1 }}>
                    <Button variant="outlined" size="small" onClick={downloadResults}>Download CSV</Button>
                    <Button variant="outlined" size="small" onClick={() => setSavedResult(result)}>Save for Comparison</Button>
                  </Box>
                </Box>
                <Grid container spacing={1.5}>
                  {metrics.map((m, i) => (
                    <Grid item xs={6} sm={4} md={3} key={i}>
                      <Paper
                        variant="outlined"
                        sx={{
                          p: 1.5, borderRadius: 2,
                          borderColor: m.color === "success.main" ? "rgba(16,185,129,0.2)"
                            : m.color === "error.main" ? "rgba(239,68,68,0.2)"
                            : "rgba(255,255,255,0.07)",
                          backgroundColor: m.color === "success.main" ? "rgba(16,185,129,0.04)"
                            : m.color === "error.main" ? "rgba(239,68,68,0.04)"
                            : "transparent",
                        }}
                      >
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ textTransform: "uppercase", letterSpacing: "0.05em", mb: 0.5 }}>
                          {m.label}
                        </Typography>
                        <Typography variant="h6" sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "1.1rem", fontWeight: 700, color: m.color }}>
                          {m.value}
                        </Typography>
                      </Paper>
                    </Grid>
                  ))}
                </Grid>
              </Paper>

              {/* Comparison section */}
              {savedResult && result && (savedResult.ran_at !== result.ran_at || savedResult.id !== result.id) && (
                <Paper sx={{ p: 2.5 }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                    <Typography variant="subtitle1">Comparison</Typography>
                    <Button size="small" variant="text" color="error" onClick={() => setSavedResult(null)}>
                      Clear Comparison
                    </Button>
                  </Box>
                  <Grid container spacing={2}>
                    <Grid item xs={4}><Typography variant="caption" color="text.secondary">Metric</Typography></Grid>
                    <Grid item xs={4}>
                      <Typography variant="caption" color="primary.main" sx={{ fontWeight: 700 }}>
                        Saved: {savedResult.universe} ({savedResult.startDate}→{savedResult.endDate})
                      </Typography>
                    </Grid>
                    <Grid item xs={4}>
                      <Typography variant="caption" color="success.main" sx={{ fontWeight: 700 }}>Current</Typography>
                    </Grid>
                    {[
                      { label: "CAGR %", key: "cagr", higherBetter: true },
                      { label: "Total Return %", key: "totalReturn", higherBetter: true },
                      { label: "Sharpe", key: "sharpe", higherBetter: true },
                      { label: "Max Drawdown %", key: "maxDrawdown", higherBetter: false },
                      { label: "Win Rate %", key: "winRate", higherBetter: true },
                      { label: "Risk:Reward", key: "riskToReward", higherBetter: true },
                    ].map(({ label, key, higherBetter }) => {
                      const sv = savedResult[key] ?? 0
                      const cv = result[key] ?? 0
                      const savedBetter = higherBetter ? sv > cv : sv < cv
                      const currentBetter = higherBetter ? cv > sv : cv < sv
                      return (
                        <Fragment key={key}>
                          <Grid item xs={4}>
                            <Typography variant="body2" color="text.secondary">{label}</Typography>
                          </Grid>
                          <Grid item xs={4}>
                            <Typography variant="body2" sx={{ color: savedBetter ? "success.main" : currentBetter ? "error.main" : "text.primary", fontFamily: "'JetBrains Mono', monospace" }}>
                              {sv}
                            </Typography>
                          </Grid>
                          <Grid item xs={4}>
                            <Typography variant="body2" sx={{ color: currentBetter ? "success.main" : savedBetter ? "error.main" : "text.primary", fontFamily: "'JetBrains Mono', monospace" }}>
                              {cv}
                            </Typography>
                          </Grid>
                        </Fragment>
                      )
                    })}
                  </Grid>
                </Paper>
              )}

              {/* Equity curve */}
              {chartData.length > 0 && (
                <Paper sx={{ p: 2.5 }}>
                  <Typography variant="subtitle1" gutterBottom>Equity Curve</Typography>
                  <EquityChart chartData={chartData} />
                </Paper>
              )}

              {result.drawdownCurve && <DrawdownChart drawdownCurve={result.drawdownCurve} />}
              {result.monthlyReturns && <HeatmapTable monthlyReturns={result.monthlyReturns} />}
            </Stack>
          )}

          {activeResultTab === "config" && (
            <Paper sx={{ p: 2.5 }}>
              <Typography variant="subtitle1" gutterBottom>Backtest Configuration</Typography>
              <TableContainer sx={{ overflowX: "auto" }}>
              <Table size="small">
                <TableBody>
                  {[
                    ["Universe", result.universe],
                    ["Period", `${result.startDate} to ${result.endDate}`],
                    ["Initial Capital", `₹${(result.investedCapital || 0).toLocaleString()}`],
                    ["Stocks in Portfolio", topN],
                    ["Exit Rank", exitRank > 0 ? exitRank : "N/A (full replacement)"],
                    ["Rebalance", REBAL_OPTIONS.find(o => o.value === Number(rebalFreq))?.label || `${rebalFreq}d`],
                    ["Formula", <Box component="code" sx={{ fontFamily: "'JetBrains Mono', monospace", bgcolor: "background.default", px: 0.75, py: 0.25, borderRadius: 0.5, fontSize: "0.8rem" }}>{formula || "Default"}</Box>],
                    ["Regime Filter", regimeEnabled ? `Supertrend(${regimePeriod}, ${regimeMultiplier}) — ${regimeAction}` : "Disabled"],
                    ["Uncorrelated Asset", uncorrelatedEnabled ? uncorrelatedSymbol : "Disabled"],
                    ["Symbols Used", result.symbolsUsed],
                    ["Total Rebalances", result.rebalances],
                  ].map(([label, value], i) => (
                    <TableRow key={i}>
                      <TableCell sx={{ color: "text.secondary", width: "40%" }}>{label}</TableCell>
                      <TableCell>{value}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </TableContainer>
            </Paper>
          )}
        </Box>
      )}

      {/* Load Previous Backtest Dialog */}
      <Dialog open={loadDialogOpen} onClose={() => setLoadDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Load Previous Backtest for Comparison</DialogTitle>
        <DialogContent>
          {previousBacktests.length === 0 ? (
            <Typography color="text.secondary">No previous backtests found.</Typography>
          ) : (
            <List dense>
              {previousBacktests.map(bt => (
                <ListItemButton key={bt.id} onClick={() => {
                  setSavedResult({ ...bt, ...(bt.result || {}) })
                  setLoadDialogOpen(false)
                }}>
                  <ListItemText
                    primary={`${bt.universe} — CAGR: ${bt.cagr}% | Sharpe: ${bt.sharpe}`}
                    secondary={new Date(bt.ran_at).toLocaleString()}
                  />
                </ListItemButton>
              ))}
            </List>
          )}
        </DialogContent>
      </Dialog>

      {/* Sample strategies */}
      <Paper sx={{ p: 2.5 }}>
        <Typography variant="subtitle1" gutterBottom>Explore Custom Backtest</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Try these preset strategies:</Typography>
        <Grid container spacing={1.5}>
          {SAMPLE_STRATEGIES.map((s, i) => (
            <Grid item xs={12} sm={6} key={i}>
              <Card variant="outlined" sx={{ cursor: "pointer", transition: "all 0.15s ease", "&:hover": { borderColor: "primary.main", backgroundColor: "rgba(59,130,246,0.04)" } }}>
                <CardActionArea onClick={() => { setFormula(s.formula); setStrategyName(s.name) }}>
                  <CardContent sx={{ py: 1.5 }}>
                    <Typography variant="subtitle2">{s.name}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      {s.formula}
                    </Typography>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Paper>
    </Stack>
  )
}
