import { useState, useEffect } from "react"
import { api } from "../api"
import PortfolioDetail from "./PortfolioDetail"
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
import Grid from "@mui/material/Grid"
import Card from "@mui/material/Card"
import CardActionArea from "@mui/material/CardActionArea"
import CardContent from "@mui/material/CardContent"
import IconButton from "@mui/material/IconButton"
import DeleteIcon from "@mui/icons-material/Delete"

export default function PortfolioManager() {
  const [portfolios, setPortfolios] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState("")
  const [newUniverse, setNewUniverse] = useState("nifty500")

  useEffect(() => { loadPortfolios() }, [])

  async function loadPortfolios() {
    setLoading(true)
    try {
      const data = await api.getPortfolios()
      setPortfolios(data.portfolios || [])
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  async function handleCreate() {
    if (!newName.trim()) return
    setError(null)
    try {
      const p = await api.createPortfolio({ name: newName, universe: newUniverse })
      setPortfolios(prev => [p, ...prev])
      setShowCreate(false); setNewName(""); setSelected(p.id)
    } catch (e) { setError(e.message) }
  }

  async function handleDelete(id) {
    if (!confirm("Delete this portfolio and all holdings?")) return
    try {
      await api.deletePortfolio(id)
      setPortfolios(prev => prev.filter(p => p.id !== id))
      if (selected === id) setSelected(null)
    } catch (e) { setError(e.message) }
  }

  if (selected) {
    return <PortfolioDetail portfolioId={selected} onBack={() => { setSelected(null); loadPortfolios() }} />
  }

  return (
    <Stack spacing={2.5}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.25 }}>My Portfolios</Typography>
          <Typography variant="body2" color="text.secondary">
            Track your stock holdings, monitor P&L, and refresh live prices from Yahoo Finance.
          </Typography>
        </Box>
        <Button variant="contained" onClick={() => { setShowCreate(!showCreate); setError(null) }} sx={{ flexShrink: 0, mt: 0.5 }}>
          {showCreate ? "Cancel" : "+ New Portfolio"}
        </Button>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      {showCreate && (
        <Paper sx={{ p: 2.5 }}>
          <Stack direction="row" sx={{ flexWrap: "wrap", gap: 2, alignItems: "flex-end" }}>
            <TextField size="small" label="Name" placeholder="My Momentum Portfolio"
              value={newName} onChange={e => setNewName(e.target.value)} sx={{ width: 220 }}
              slotProps={{ input: { sx: { fontFamily: "'Outfit', sans-serif" } } }} />
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Universe</InputLabel>
              <Select value={newUniverse} label="Universe" onChange={e => setNewUniverse(e.target.value)}>
                <MenuItem value="nifty50">NIFTY 50</MenuItem>
                <MenuItem value="nifty100">NIFTY 100</MenuItem>
                <MenuItem value="nifty200">NIFTY 200</MenuItem>
                <MenuItem value="nifty500">NIFTY 500</MenuItem>
              </Select>
            </FormControl>
            <Button variant="contained" onClick={handleCreate}>Create</Button>
          </Stack>
        </Paper>
      )}

      {loading && <Typography color="text.secondary" sx={{ p: 2, textAlign: "center" }}>Loading portfolios...</Typography>}

      {!loading && portfolios.length === 0 && (
        <Box sx={{ textAlign: "center", py: 8 }}>
          <Typography variant="h6" color="text.secondary" sx={{ fontWeight: 400, mb: 1 }}>
            No portfolios yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3, opacity: 0.7 }}>
            Create a portfolio to start tracking your stock holdings and P&L.
          </Typography>
          <Button variant="contained" onClick={() => setShowCreate(true)}>+ Create your first portfolio</Button>
        </Box>
      )}

      {portfolios.length > 0 && (
        <Grid container spacing={2}>
          {portfolios.map(p => (
            <Grid item xs={12} sm={6} md={4} key={p.id}>
              <Card variant="outlined" sx={{ cursor: "pointer", borderColor: "rgba(255,255,255,0.07)", transition: "all 0.2s ease", "&:hover": { borderColor: "primary.main", boxShadow: "0 0 0 1px rgba(59,130,246,0.3), 0 4px 20px rgba(59,130,246,0.1)", transform: "translateY(-2px)" } }}>
                <CardActionArea onClick={() => setSelected(p.id)}>
                  <CardContent>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{p.name}</Typography>
                      <IconButton size="small" color="error"
                        onClick={e => { e.stopPropagation(); handleDelete(p.id) }}
                        aria-label={`Delete portfolio ${p.name}`}
                        title="Delete portfolio">
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                    <Stack direction="row" sx={{ gap: 2, mb: 0.5 }}>
                      <Typography variant="caption" color="text.secondary">{p.universe?.toUpperCase()}</Typography>
                      <Typography variant="caption" color="text.secondary">{p.holding_count || 0} holdings</Typography>
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      Created {p.created_at?.slice(0, 10)}
                    </Typography>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ textAlign: "right", display: "block" }}>
        {portfolios.length}/5 portfolios used
      </Typography>
    </Stack>
  )
}
