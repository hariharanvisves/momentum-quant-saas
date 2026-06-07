import Paper from "@mui/material/Paper"
import Typography from "@mui/material/Typography"
import Table from "@mui/material/Table"
import TableBody from "@mui/material/TableBody"
import TableCell from "@mui/material/TableCell"
import TableContainer from "@mui/material/TableContainer"
import TableHead from "@mui/material/TableHead"
import TableRow from "@mui/material/TableRow"

export default function ResultsTable({ scores, title }) {
  if (!scores || scores.length === 0) {
    return <Typography color="text.secondary" sx={{ p: 4, textAlign: "center" }}>No results</Typography>
  }

  return (
    <Paper sx={{ p: 0 }}>
      {title && <Typography variant="subtitle2" sx={{ p: 1.5, pb: 0 }}>{title}</Typography>}
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>#</TableCell>
              <TableCell>Symbol</TableCell>
              <TableCell>Score</TableCell>
              <TableCell>Momentum</TableCell>
              <TableCell>Volatility</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {scores.map((row, i) => (
              <TableRow key={row.symbol}>
                <TableCell sx={{ color: "text.secondary", width: 48 }}>{i + 1}</TableCell>
                <TableCell sx={{ color: "primary.main", fontWeight: 600 }}>{row.symbol}</TableCell>
                <TableCell sx={{ color: row.score >= 0 ? "success.main" : "error.main", fontVariantNumeric: "tabular-nums" }}>
                  {row.score.toFixed(4)}
                </TableCell>
                <TableCell>{row.momentum?.toFixed(4) ?? "—"}</TableCell>
                <TableCell>{row.volatility?.toFixed(4) ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  )
}
