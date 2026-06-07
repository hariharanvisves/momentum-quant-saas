import { useState, useEffect } from "react"
import { api } from "../api"
import FormulaInput from "./FormulaInput"
import Box from "@mui/material/Box"
import Paper from "@mui/material/Paper"
import Typography from "@mui/material/Typography"
import Stack from "@mui/material/Stack"
import Button from "@mui/material/Button"
import TextField from "@mui/material/TextField"
import Alert from "@mui/material/Alert"
import Chip from "@mui/material/Chip"
import CircularProgress from "@mui/material/CircularProgress"
import Table from "@mui/material/Table"
import TableBody from "@mui/material/TableBody"
import TableCell from "@mui/material/TableCell"
import TableContainer from "@mui/material/TableContainer"
import TableHead from "@mui/material/TableHead"
import TableRow from "@mui/material/TableRow"

const FACTOR_EXAMPLES = [
  "6 Month Performance / 6 Month Volatility",
  "6 Month Performance - 6 Month Volatility",
  "(60% * 6 Month Performance + 40% * 3 Month Performance) / 6 Month Volatility",
  "12 Month Performance - 1 Month Performance",
  "3 Month Performance / 3 Month Volatility",
]

export default function StrategiesPanel() {
  const [strategies, setStrategies] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [editId, setEditId] = useState(null)
  const [name, setName] = useState("")
  const [formula, setFormula] = useState("")
  const [description, setDescription] = useState("")
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true); setError(null)
    try {
      const data = await api.getStrategies()
      setStrategies(data.strategies)
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  function startEdit(s) { setEditId(s.id); setName(s.name); setFormula(s.formula); setDescription(s.description || ""); setFormError(null) }
  function startNew() { setEditId(null); setName(""); setFormula(""); setDescription(""); setFormError(null) }

  async function save() {
    if (!name.trim()) { setFormError("Name is required"); return }
    if (!formula.trim()) { setFormError("Formula is required"); return }
    setSaving(true); setFormError(null)
    try {
      if (editId) {
        await api.updateStrategy(editId, { name: name.trim(), formula: formula.trim(), description: description.trim() || null })
      } else {
        await api.createStrategy({ name: name.trim(), formula: formula.trim(), description: description.trim() || null })
      }
      startNew(); await load()
    } catch (e) { setFormError(e.message) } finally { setSaving(false) }
  }

  async function remove(id, stratName) {
    if (!confirm(`Delete strategy "${stratName}"?`)) return
    try { await api.deleteStrategy(id); await load() } catch (e) { setError(e.message) }
  }

  return (
    <Stack spacing={2.5}>
      {/* Page header */}
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.25 }}>Strategy Library</Typography>
        <Typography variant="body2" color="text.secondary">
          Save and manage reusable scoring formulas. Saved strategies are available in the Scanner and Backtest tabs via the "Load saved strategy" dropdown.
        </Typography>
      </Box>

      <Paper sx={{ p: 2.5 }}>
        <Typography variant="subtitle1" gutterBottom>{editId ? "Edit Strategy" : "New Strategy"}</Typography>

        {/* Name + Description row */}
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 2, mb: 2 }}>
          <TextField
            size="small" label="Name" placeholder="My Momentum"
            value={name} onChange={e => setName(e.target.value)}
            sx={{ width: 200 }}
            slotProps={{ input: { sx: { fontFamily: "'Outfit', sans-serif" } } }}
          />
          <TextField
            size="small" label="Description (optional)" placeholder="Brief note about this strategy"
            value={description} onChange={e => setDescription(e.target.value)}
            sx={{ flex: "1 1 240px" }}
            slotProps={{ input: { sx: { fontFamily: "'Outfit', sans-serif" } } }}
          />
        </Stack>

        {/* Formula full-width */}
        <Box sx={{ mb: 1.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block", letterSpacing: "0.03em" }}>
            Formula
          </Typography>
          <FormulaInput
            value={formula} onChange={setFormula}
            placeholder="e.g. 6 Month Performance / 6 Month Volatility"
          />
        </Box>

        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, alignItems: "center", mb: 1.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>Examples:</Typography>
          {FACTOR_EXAMPLES.map(ex => (
            <Chip
              key={ex}
              label={ex.length > 38 ? ex.slice(0, 38) + "…" : ex}
              size="small"
              variant="outlined"
              onClick={() => setFormula(ex)}
              title={ex}
              sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.72rem", cursor: "pointer" }}
            />
          ))}
        </Box>

        {formError && <Alert severity="error" sx={{ mb: 1.5 }}>{formError}</Alert>}

        <Stack direction="row" sx={{ gap: 1.5 }}>
          <Button variant="contained" onClick={save} disabled={saving}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}>
            {saving ? "Saving…" : editId ? "Update" : "Save Strategy"}
          </Button>
          {editId && <Button variant="outlined" onClick={startNew}>Cancel</Button>}
        </Stack>
      </Paper>

      {error && <Alert severity="error">{error}</Alert>}
      {loading && <Typography color="text.secondary" sx={{ p: 2, textAlign: "center" }}>Loading…</Typography>}

      {!loading && strategies.length === 0 && (
        <Typography color="text.secondary" sx={{ p: 4, textAlign: "center" }}>
          No strategies saved yet. Create one above.
        </Typography>
      )}

      {strategies.length > 0 && (
        <Paper sx={{ p: 0 }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Formula</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell>Updated</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {strategies.map(s => (
                  <TableRow key={s.id} sx={editId === s.id ? { backgroundColor: "rgba(59,130,246,0.08)" } : {}}>
                    <TableCell sx={{ color: "primary.main", fontWeight: 600 }}>{s.name}</TableCell>
                    <TableCell sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.78rem", color: "text.secondary", maxWidth: 280, wordBreak: "break-word" }}>
                      {s.formula}
                    </TableCell>
                    <TableCell sx={{ color: "text.secondary", fontSize: "0.8rem" }}>{s.description || "—"}</TableCell>
                    <TableCell sx={{ color: "text.secondary", fontSize: "0.8rem" }}>{s.updated_at?.slice(0, 10)}</TableCell>
                    <TableCell>
                      <Stack direction="row" sx={{ gap: 0.5 }}>
                        <Button size="small" variant="outlined" onClick={() => startEdit(s)}>Edit</Button>
                        <Button size="small" variant="outlined" color="error" onClick={() => remove(s.id, s.name)}>Delete</Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Stack>
  )
}
