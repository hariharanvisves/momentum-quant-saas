import { useState } from "react"
import { useAuth } from "../contexts/AuthContext"
import Box from "@mui/material/Box"
import Paper from "@mui/material/Paper"
import Typography from "@mui/material/Typography"
import TextField from "@mui/material/TextField"
import Button from "@mui/material/Button"
import Alert from "@mui/material/Alert"
import Stack from "@mui/material/Stack"
import Divider from "@mui/material/Divider"

const BrandMark = () => (
  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 4, justifyContent: "center" }}>
    <Box sx={{ width: 40, height: 40, borderRadius: 2.5, background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 28px rgba(59,130,246,0.4)", flexShrink: 0 }}>
      <Box component="span" sx={{ fontWeight: 900, fontSize: "1.1rem", color: "#fff", fontFamily: "'Outfit', sans-serif", lineHeight: 1 }}>M</Box>
    </Box>
    <Box>
      <Typography sx={{ fontWeight: 800, fontSize: "1.1rem", lineHeight: 1.1, letterSpacing: "-0.03em", background: "linear-gradient(90deg, #f1f5f9 0%, #94a3b8 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontFamily: "'Outfit', sans-serif" }}>Momentum Quant</Typography>
      <Typography variant="caption" sx={{ color: "#475569", letterSpacing: "0.02em", fontSize: "0.7rem" }}>NIFTY Momentum Scanner</Typography>
    </Box>
  </Box>
)

const cardSx = { p: 4, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 3, boxShadow: "0 24px 64px rgba(0,0,0,0.5)", background: "linear-gradient(145deg, #111827 0%, #0f172a 100%)" }

export default function RegisterPage({ onSwitchToLogin }) {
  const { register } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) { setError("Passwords don't match"); return }
    setLoading(true)
    try {
      await register(email, password)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", backgroundColor: "background.default" }}>
      <Box sx={{ width: "100%", maxWidth: 420, px: 2 }}>
        <BrandMark />
        <Paper sx={cardSx}>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>Create Account</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Start tracking momentum strategies
          </Typography>
          <Box component="form" onSubmit={handleSubmit}>
            <Stack spacing={2.5}>
              <TextField
                type="email" value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Email address" required fullWidth
                autoComplete="email"
                slotProps={{ input: { sx: { fontFamily: "'Outfit', sans-serif" } } }}
              />
              <TextField
                type="password" value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Password (min 6 characters)" required fullWidth
                inputProps={{ minLength: 6 }}
                autoComplete="new-password"
                slotProps={{ input: { sx: { fontFamily: "'Outfit', sans-serif" } } }}
              />
              <TextField
                type="password" value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Confirm password" required fullWidth
                autoComplete="new-password"
                slotProps={{ input: { sx: { fontFamily: "'Outfit', sans-serif" } } }}
              />
              {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}
              <Button type="submit" variant="contained" fullWidth disabled={loading}
                sx={{ py: 1.25, fontSize: "0.95rem", fontWeight: 600, borderRadius: 2, mt: 0.5 }}>
                {loading ? "Creating…" : "Create Account"}
              </Button>
            </Stack>
          </Box>

          <Divider sx={{ my: 2.5, borderColor: "rgba(255,255,255,0.06)" }} />

          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              Already have an account?
            </Typography>
            <Button variant="text" size="small" onClick={onSwitchToLogin}
              sx={{ p: 0, minWidth: 0, fontWeight: 600, color: "primary.light", fontSize: "0.875rem", lineHeight: 1.5,
                transition: "color 0.15s ease",
                "&:hover": { color: "#bfdbfe", backgroundColor: "transparent" } }}>
              Sign In
            </Button>
          </Box>
        </Paper>
      </Box>
    </Box>
  )
}
