import { useState, useEffect, useMemo } from "react"
import { api } from "../api"
import Pagination from "./Pagination"
import QuantityCalculator from "./QuantityCalculator"
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
import Chip from "@mui/material/Chip"
import Table from "@mui/material/Table"
import TableBody from "@mui/material/TableBody"
import TableCell from "@mui/material/TableCell"
import TableContainer from "@mui/material/TableContainer"
import TableHead from "@mui/material/TableHead"
import TableRow from "@mui/material/TableRow"

export default function ScannerPanel() {
  const [universe, setUniverse] = useState("nifty500")
  const [sector, setSector] = useState("")
  const [priceMin, setPriceMin] = useState("")
  const [priceMax, setPriceMax] = useState("")
  const [formula, setFormula] = useState("6 Month Performance / 6 Month Volatility")
  const [saveFormula, setSaveFormula] = useState(false)
  const [formulaName, setFormulaName] = useState("")
  const [strategies, setStrategies] = useState([])
  const [selectedStrategy, setSelectedStrategy] = useState("")
  const [sectors, setSectors] = useState([])
  const [sectorMap, setSectorMap] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [allScores, setAllScores] = useState([])
  const [scanMeta, setScanMeta] = useState(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [showQtyCalc, setShowQtyCalc] = useState(false)

  useEffect(() => {
    api.getStrategies().then(data => setStrategies(data.strategies || [])).catch(() => {})
    api.getSectors().then(data => {
      setSectorMap(data)
      setSectors(data._sectors || [])
    }).catch(() => {})
  }, [])

  function loadStrategy(id) {
    const strat = strategies.find(s => String(s.id) === String(id))
    if (strat) { setFormula(strat.formula); setFormulaName(strat.name); setSelectedStrategy(id) }
  }

  function clearForm() {
    setFormula(""); setFormulaName(""); setAllScores([]); setScanMeta(null)
    setError(null); setSelectedStrategy(""); setSector("")
    setPriceMin(""); setPriceMax(""); setPage(1)
  }

  async function runScore() {
    setLoading(true); setError(null)
    try {
      const params = {
        universe,
        formula: formula.trim(),
        pageSize: 1000,
        priceMin: priceMin ? Number(priceMin) : null,
        priceMax: priceMax ? Number(priceMax) : null,
      }
      const data = await api.score(params)
      let enriched = (data.results || []).map((s, i) => ({
        ...s,
        rank: i + 1,
        sector: sectorMap[s.symbol] || "—",
        indexBadge: universe.replace("nifty", "N"),
      }))
      if (sector) {
        enriched = enriched.filter(s => s.sector === sector)
        enriched.forEach((s, i) => { s.rank = i + 1 })
      }
      setAllScores(enriched)
      setScanMeta({
        scanId: data.scanId || data.scoreId,
        symbolsScanned: data.symbolsScanned || (data.results || []).length,
        totalInUniverse: data.totalInUniverse || data.totalResults || "—",
      })
      setPage(1)
      if (saveFormula && formulaName.trim()) {
        api.createStrategy({ name: formulaName.trim(), formula: formula.trim() }).catch(() => {})
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const paginatedScores = useMemo(() => {
    const start = (page - 1) * pageSize
    return allScores.slice(start, start + pageSize)
  }, [allScores, page, pageSize])

  function downloadCSV() {
    if (allScores.length === 0) return
    const rows = [
      ["Rank", "Index", "Symbol", "Sector", "Stock Price", "Score"],
      ...allScores.map(s => [
        s.rank, s.indexBadge, s.symbol, s.sector,
        s.price ?? "",
        typeof s.score === "number" ? s.score.toFixed(4) : "",
      ])
    ]
    const csv = rows.map(r => r.join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = `score-${universe}-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Stack spacing={2.5}>
      {/* Page header */}
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.25 }}>EOD Score Scanner</Typography>
        <Typography variant="body2" color="text.secondary">
          Rank stocks in any NIFTY universe using a custom multi-factor formula. Click a factor pill to insert it into the formula, then hit Score.
        </Typography>
      </Box>

      {/* EOD Scoring filters */}
      <Paper sx={{ p: 2.5 }}>
        <Typography variant="subtitle1" gutterBottom sx={{ mb: 1.5 }}>Filters</Typography>
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 2, alignItems: "flex-end", mt: 0.5 }}>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Universe</InputLabel>
            <Select value={universe} label="Universe" onChange={e => setUniverse(e.target.value)}>
              <MenuItem value="nifty50">NIFTY 50</MenuItem>
              <MenuItem value="nifty100">NIFTY 100</MenuItem>
              <MenuItem value="nifty200">NIFTY 200</MenuItem>
              <MenuItem value="nifty250">NIFTY 250</MenuItem>
              <MenuItem value="nifty500">NIFTY 500</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 170 }}>
            <InputLabel>Sector</InputLabel>
            <Select value={sector} label="Sector" onChange={e => setSector(e.target.value)}>
              <MenuItem value="">All Sectors</MenuItem>
              {sectors.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField
            type="number" size="small" label="Min Price ₹" placeholder="0"
            value={priceMin} onChange={e => setPriceMin(e.target.value)}
            inputProps={{ min: 0 }} sx={{ width: 130 }}
          />
          <TextField
            type="number" size="small" label="Max Price ₹" placeholder="No limit"
            value={priceMax} onChange={e => setPriceMax(e.target.value)}
            inputProps={{ min: 0 }} sx={{ width: 130 }}
          />
        </Stack>
      </Paper>

      {/* Scoring console */}
      <Paper sx={{ p: 2.5 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
          <Typography variant="subtitle1">Scoring Formula</Typography>
          <Typography variant="caption" color="text.secondary">
            Click factors below or type — Tab to autocomplete
          </Typography>
        </Box>
        <FormulaInput
          multiline
          value={formula}
          onChange={setFormula}
          placeholder="e.g. 6 Month Performance / 6 Month Volatility"
          rows={2}
        />
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 2, alignItems: "center", mt: 2 }}>
          <FormControlLabel
            control={<Switch size="small" checked={saveFormula} onChange={e => setSaveFormula(e.target.checked)} />}
            label={<Typography variant="body2" color="text.secondary">Save as Strategy</Typography>}
            sx={{ m: 0 }}
          />
          {saveFormula && (
            <TextField
              size="small" label="Strategy name" placeholder="e.g. Risk-Adjusted Momentum"
              value={formulaName} onChange={e => setFormulaName(e.target.value)}
              sx={{ width: 220 }}
              slotProps={{ input: { sx: { fontFamily: "'Outfit', sans-serif" } } }}
            />
          )}
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Load saved strategy</InputLabel>
            <Select
              value={selectedStrategy}
              label="Load saved strategy"
              onChange={e => loadStrategy(e.target.value)}
            >
              <MenuItem value="">— Select —</MenuItem>
              {strategies.map(s => <MenuItem key={s.id} value={String(s.id)}>{s.name}</MenuItem>)}
            </Select>
          </FormControl>
        </Stack>
        <Stack direction="row" sx={{ gap: 1.5, mt: 2 }}>
          <Button
            variant="contained"
            size="medium"
            onClick={runScore}
            disabled={loading}
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}
            sx={{ px: 3 }}
          >
            {loading ? "Scoring…" : "Run Score"}
          </Button>
          <Button variant="outlined" onClick={clearForm} color="inherit" sx={{ color: "text.secondary" }}>Reset</Button>
        </Stack>
      </Paper>

      {error && <Alert severity="error">{error}</Alert>}

      {!loading && allScores.length === 0 && !error && !scanMeta && (
        <Box sx={{ textAlign: "center", py: 8, color: "text.secondary" }}>
          <Typography variant="h6" gutterBottom>Run a scan to see results</Typography>
          <Typography variant="body2">Select a universe, choose a formula, and click Score.</Typography>
        </Box>
      )}

      {allScores.length > 0 && (
        <Paper sx={{ p: 0, overflow: "hidden" }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", px: 2.5, py: 2, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <Box>
              <Typography variant="subtitle1">Results</Typography>
              {scanMeta && (
                <Typography variant="caption" color="text.secondary">
                  {allScores.length.toLocaleString()} stocks ranked · Scanned {scanMeta.symbolsScanned?.toLocaleString()}/{scanMeta.totalInUniverse?.toLocaleString()}
                  {scanMeta.scanId ? ` · Run #${scanMeta.scanId}` : ""}
                </Typography>
              )}
            </Box>
            <Stack direction="row" sx={{ gap: 1 }}>
              <Button variant="outlined" size="small" onClick={downloadCSV} sx={{ color: "text.secondary", borderColor: "rgba(255,255,255,0.1)" }}>
                ↓ CSV
              </Button>
              <Button variant="outlined" size="small" onClick={() => setShowQtyCalc(true)} color="primary">
                Qty Calc
              </Button>
            </Stack>
          </Box>

          <TableContainer sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>#</TableCell>
                  <TableCell>Symbol</TableCell>
                  <TableCell>Sector</TableCell>
                  <TableCell align="right">Price</TableCell>
                  <TableCell align="right">Score</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedScores.map(row => (
                  <TableRow key={row.symbol}>
                    <TableCell sx={{ color: "text.secondary", width: 44, fontFamily: "'JetBrains Mono', monospace", fontSize: "0.8rem" }}>
                      {row.rank}
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Typography sx={{ color: "primary.light", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", fontSize: "0.88rem" }}>
                          {row.symbol}
                        </Typography>
                        <Chip
                          label={row.indexBadge}
                          size="small"
                          sx={{
                            bgcolor: "rgba(99,102,241,0.12)", color: "#818cf8",
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: "0.6rem", height: 18, borderRadius: 1,
                            "& .MuiChip-label": { px: 0.6 },
                          }}
                        />
                      </Box>
                    </TableCell>
                    <TableCell>
                      {row.sector !== "—" ? (
                        <Chip
                          label={row.sector}
                          size="small"
                          sx={{
                            bgcolor: "rgba(16,185,129,0.08)", color: "#34d399",
                            fontSize: "0.68rem", height: 20, borderRadius: 1,
                            fontFamily: "'Outfit', sans-serif",
                            "& .MuiChip-label": { px: 0.75 },
                          }}
                        />
                      ) : <Typography variant="caption" color="text.secondary">—</Typography>}
                    </TableCell>
                    <TableCell align="right">
                      <Typography sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.85rem", color: "text.primary" }}>
                        {row.price != null ? `₹${Number(row.price).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography
                        sx={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontWeight: 700,
                          fontSize: "0.88rem",
                          color: (row.score ?? 0) >= 0 ? "success.light" : "error.light",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {typeof row.score === "number" ? row.score.toFixed(4) : "—"}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Box sx={{ px: 1, py: 0.5, borderTop: "1px solid rgba(255,255,255,0.04)" }}>
            <Pagination
              page={page} pageSize={pageSize} total={allScores.length}
              onPageChange={setPage}
              onPageSizeChange={size => { setPageSize(size); setPage(1) }}
            />
          </Box>
        </Paper>
      )}

      {showQtyCalc && (
        <QuantityCalculator scores={allScores} onClose={() => setShowQtyCalc(false)} />
      )}
    </Stack>
  )
}
