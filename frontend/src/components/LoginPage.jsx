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

export default function LoginPage({ onSwitchToRegister, onForgotPassword }) {
  const { login } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(email, password)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", backgroundColor: "background.default" }}>
      <Box sx={{ width: "100%", maxWidth: 420, px: 2 }}>
        {/* Brand mark */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 4, justifyContent: "center" }}>
          <Box
            sx={{
              width: 40, height: 40, borderRadius: 2.5,
              background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 0 28px rgba(59,130,246,0.4)",
              flexShrink: 0,
            }}
          >
            <Box component="span" sx={{ fontWeight: 900, fontSize: "1.1rem", color: "#fff", fontFamily: "'Outfit', sans-serif", lineHeight: 1 }}>
              M
            </Box>
          </Box>
          <Box>
            <Typography
              sx={{
                fontWeight: 800,
                fontSize: "1.1rem",
                lineHeight: 1.1,
                letterSpacing: "-0.03em",
                background: "linear-gradient(90deg, #f1f5f9 0%, #94a3b8 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                fontFamily: "'Outfit', sans-serif",
              }}
            >
              Momentum Quant
            </Typography>
            <Typography variant="caption" sx={{ color: "#475569", letterSpacing: "0.02em", fontSize: "0.7rem" }}>
              NIFTY Momentum Scanner
            </Typography>
          </Box>
        </Box>

        <Paper
          sx={{
            p: 4,
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 3,
            boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
            background: "linear-gradient(145deg, #111827 0%, #0f172a 100%)",
          }}
        >
          <Typography variant="h5" fontWeight={700} mb={0.5}>Sign In</Typography>
          <Typography variant="body2" color="text.secondary" mb={3}>
            Welcome back
          </Typography>
          <Box component="form" onSubmit={handleSubmit}>
            <Stack spacing={2.5}>
              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                fullWidth
                autoComplete="email"
                InputLabelProps={{ shrink: true }}
                slotProps={{ input: { sx: { fontFamily: "'Outfit', sans-serif" } } }}
              />
              <TextField
                label="Password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min 6 characters"
                required
                fullWidth
                autoComplete="current-password"
                InputLabelProps={{ shrink: true }}
                slotProps={{ input: { sx: { fontFamily: "'Outfit', sans-serif" } } }}
              />
              {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}
              <Button
                type="submit"
                variant="contained"
                fullWidth
                disabled={loading}
                sx={{ py: 1.25, fontSize: "0.95rem", fontWeight: 600, borderRadius: 2, mt: 0.5 }}
              >
                {loading ? "Signing in…" : "Sign In"}
              </Button>
            </Stack>
          </Box>

          <Divider sx={{ my: 2.5, borderColor: "rgba(255,255,255,0.06)" }} />

          <Stack spacing={1} alignItems="center">
            <Typography variant="body2" color="text.secondary">
              Don&apos;t have an account?{" "}
              <Button
                variant="text"
                size="small"
                onClick={onSwitchToRegister}
                sx={{ p: 0, minWidth: 0, fontWeight: 600, color: "primary.light", fontSize: "0.875rem" }}
              >
                Create account
              </Button>
            </Typography>
            <Button
              variant="text"
              size="small"
              onClick={onForgotPassword}
              sx={{ p: 0, minWidth: 0, color: "text.secondary", fontSize: "0.8rem", "&:hover": { color: "text.primary" } }}
            >
              Forgot password?
            </Button>
          </Stack>
        </Paper>
      </Box>
    </Box>
  )
}
