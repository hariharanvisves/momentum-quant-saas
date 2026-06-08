import { useState, useMemo } from "react"
import Dialog from "@mui/material/Dialog"
import DialogTitle from "@mui/material/DialogTitle"
import DialogContent from "@mui/material/DialogContent"
import DialogActions from "@mui/material/DialogActions"
import IconButton from "@mui/material/IconButton"
import CloseIcon from "@mui/icons-material/Close"
import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import Stack from "@mui/material/Stack"
import Button from "@mui/material/Button"
import FormControl from "@mui/material/FormControl"
import InputLabel from "@mui/material/InputLabel"
import Select from "@mui/material/Select"
import MenuItem from "@mui/material/MenuItem"
import TextField from "@mui/material/TextField"
import Table from "@mui/material/Table"
import TableBody from "@mui/material/TableBody"
import TableCell from "@mui/material/TableCell"
import TableContainer from "@mui/material/TableContainer"
import TableHead from "@mui/material/TableHead"
import TableRow from "@mui/material/TableRow"

export default function QuantityCalculator({ scores, onClose }) {
  const [capital, setCapital] = useState(1000000)

  const allocations = useMemo(() => {
    if (!scores || scores.length === 0) return []
    const perStock = capital / scores.length
    return scores.map((s, i) => {
      const price = s.stockPrice || s.price || 0
      const qty = price > 0 ? Math.floor(perStock / price) : 0
      const invested = qty * price
      return {
        rank: i + 1, symbol: s.symbol, price,
        quantity: qty, invested: Math.round(invested),
        weight: capital > 0 ? ((invested / capital) * 100).toFixed(1) : "0.0",
      }
    })
  }, [scores, capital])

  const totalInvested = allocations.reduce((sum, a) => sum + a.invested, 0)
  const cashRemaining = capital - totalInvested

  function downloadCSV() {
    const rows = [
      ["Rank","Symbol","Price","Quantity","Invested","Weight%"],
      ...allocations.map(a => [a.rank, a.symbol, a.price, a.quantity, a.invested, a.weight]),
      [], ["Total Capital", capital], ["Total Invested", totalInvested], ["Cash Remaining", cashRemaining],
    ]
    const csv = rows.map(r => r.join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = "quantity-allocation.csv"; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Quantity Calculator
        <IconButton onClick={onClose} size="small" sx={{ position: "absolute", right: 12, top: 12 }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 2, alignItems: "flex-end", mb: 2 }}>
          <TextField
            type="number" size="small" label="Total Capital"
            value={capital} onChange={e => setCapital(Number(e.target.value))}
            inputProps={{ min: 10000, step: 100000 }} sx={{ width: 160 }}
          />
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Method</InputLabel>
            <Select value="equal" label="Method">
              <MenuItem value="equal">Equal Weight</MenuItem>
            </Select>
          </FormControl>
        </Stack>

        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
          {scores.length} stocks &nbsp;|&nbsp;
          ₹{scores.length > 0 ? Math.round(capital / scores.length).toLocaleString() : 0} per stock &nbsp;|&nbsp;
          Cash remaining: ₹{cashRemaining.toLocaleString()}
        </Typography>

        {scores.length > 0 ? (
          <TableContainer sx={{ maxHeight: 400 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>#</TableCell><TableCell>Symbol</TableCell>
                  <TableCell>Price</TableCell><TableCell>Qty</TableCell>
                  <TableCell>Invested</TableCell><TableCell>Weight</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {allocations.map(a => (
                  <TableRow key={a.symbol}>
                    <TableCell sx={{ color: "text.secondary" }}>{a.rank}</TableCell>
                    <TableCell sx={{ color: "primary.main", fontWeight: 600 }}>{a.symbol}</TableCell>
                    <TableCell>₹{a.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell>
                    <TableCell>{a.quantity}</TableCell>
                    <TableCell>₹{a.invested.toLocaleString()}</TableCell>
                    <TableCell>{a.weight}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Typography color="text.secondary" align="center" sx={{ py: 2 }}>
            Run a score first to calculate quantities.
          </Typography>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 1.5 }}>
        {scores.length > 0 && (
          <Button variant="contained" onClick={downloadCSV}>Download CSV</Button>
        )}
        <Button variant="outlined" onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
