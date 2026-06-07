import { useState } from "react"
import { api } from "../api"
import ResultsTable from "./ResultsTable"
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

const STATUS_COLOR = { placed: "success", dry_run: "warning", error: "error", skipped: "default" }

export default function RebalancePanel() {
  const [universe, setUniverse] = useState("nifty500")
  const [execute, setExecute] = useState(false)
  const [dryRun, setDryRun] = useState(true)
  const [capitalPerStock, setCapitalPerStock] = useState(50000)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  async function runRebalance() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.rebalance({ universe, execute, dryRun, capitalPerStock: Number(capitalPerStock) })
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
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.25 }}>Portfolio Rebalancer</Typography>
        <Typography variant="body2" color="text.secondary">
          Scan a universe for top momentum stocks and optionally place orders via Zerodha Kite. Enable "Execute Orders" to go live; use "Dry Run" to preview without placing.
        </Typography>
      </Box>

      <Paper sx={{ p: 2.5 }}>
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 2, alignItems: "flex-start" }}>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Universe</InputLabel>
            <Select value={universe} label="Universe" onChange={e => setUniverse(e.target.value)}>
              <MenuItem value="nifty50">NIFTY 50</MenuItem>
              <MenuItem value="nifty100">NIFTY 100</MenuItem>
              <MenuItem value="nifty200">NIFTY 200</MenuItem>
              <MenuItem value="nifty500">NIFTY 500</MenuItem>
            </Select>
          </FormControl>
          <TextField
            type="number" size="small" label="Capital / Stock"
            value={capitalPerStock} onChange={e => setCapitalPerStock(e.target.value)}
            inputProps={{ min: 10000, step: 10000 }} sx={{ width: 150 }}
            slotProps={{
              input: {
                startAdornment: <Box component="span" sx={{ color: "text.secondary", mr: 0.25, fontFamily: "'Outfit', sans-serif", fontSize: "0.85rem" }}>₹</Box>,
                sx: { fontFamily: "'JetBrains Mono', monospace" },
              },
            }}
          />
          <FormControlLabel
            control={<Switch size="small" checked={execute} onChange={e => setExecute(e.target.checked)} />}
            label={<Typography variant="body2">Execute Orders</Typography>}
          />
          {execute && (
            <FormControlLabel
              control={<Switch size="small" checked={dryRun} onChange={e => setDryRun(e.target.checked)} />}
              label={<Typography variant="body2">Dry Run</Typography>}
            />
          )}
          <Button
            variant="contained" onClick={runRebalance} disabled={loading}
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {loading ? "Running..." : "Rebalance"}
          </Button>
        </Stack>
      </Paper>

      {error && <Alert severity="error">{error}</Alert>}

      {result && (
        <Stack spacing={2.5}>
          {result.orders && (
            <Paper sx={{ p: 0 }}>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Symbol</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Qty</TableCell>
                      <TableCell>Price</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {result.orders.map((o, i) => (
                      <TableRow key={i}>
                        <TableCell sx={{ color: "primary.main", fontWeight: 600 }}>{o.symbol}</TableCell>
                        <TableCell>
                          <Chip
                            label={o.status}
                            size="small"
                            color={STATUS_COLOR[o.status] || "default"}
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>{o.quantity || "—"}</TableCell>
                        <TableCell>{o.price ? `₹${o.price.toFixed(2)}` : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}
          {result.data && <ResultsTable scores={result.data} title="Top Stocks" />}
        </Stack>
      )}
    </Stack>
  )
}

