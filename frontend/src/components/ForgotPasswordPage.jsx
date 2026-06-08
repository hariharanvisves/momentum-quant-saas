import { useState } from "react"
import { api } from "../api"
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
    <Box sx={{
      width: 40, height: 40, borderRadius: 2.5,
      background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: "0 0 28px rgba(59,130,246,0.4)", flexShrink: 0,
    }}>
      <Box component="span" sx={{ fontWeight: 900, fontSize: "1.1rem", color: "#fff", fontFamily: "'Outfit', sans-serif", lineHeight: 1 }}>M</Box>
    </Box>
    <Box>
      <Typography sx={{
        fontWeight: 800, fontSize: "1.1rem", lineHeight: 1.1, letterSpacing: "-0.03em",
        background: "linear-gradient(90deg, #f1f5f9 0%, #94a3b8 100%)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        fontFamily: "'Outfit', sans-serif",
      }}>Momentum Quant</Typography>
      <Typography variant="caption" sx={{ color: "#475569", letterSpacing: "0.02em", fontSize: "0.7rem" }}>NIFTY Momentum Scanner</Typography>
    </Box>
  </Box>
)

const cardSx = {
  p: 4,
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 3,
  boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
  background: "linear-gradient(145deg, #111827 0%, #0f172a 100%)",
}

const pageWrap = {
  display: "flex", justifyContent: "center", alignItems: "center",
  minHeight: "100vh", backgroundColor: "background.default",
}

const inputProps = { slotProps: { input: { sx: { fontFamily: "'Outfit', sans-serif" } } } }

export default function ForgotPasswordPage({ onBack }) {
  const [step, setStep] = useState(1)
  const [email, setEmail] = useState("")
  const [token, setToken] = useState("")
  const [devToken, setDevToken] = useState(null)
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  async function handleForgot(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const data = await api.forgotPassword(email)
      if (data.token) { setDevToken(data.token); setToken(data.token) }
      setStep(2)
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  async function handleReset(e) {
    e.preventDefault()
    if (password !== confirm) { setError("Passwords don't match"); return }
    setError(null)
    setLoading(true)
    try {
      const data = await api.resetPassword(token, password)
      setSuccess(data.message)
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  if (success) {
    return (
      <Box sx={pageWrap}>
        <Box sx={{ width: "100%", maxWidth: 420, px: 2 }}>
          <BrandMark />
          <Paper sx={cardSx}>
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>Password Reset</Typography>
            <Typography color="success.main" sx={{ mb: 3 }}>{success}</Typography>
            <Button variant="contained" fullWidth onClick={onBack}
              sx={{ py: 1.25, fontSize: "0.95rem", fontWeight: 600, borderRadius: 2 }}>
              Back to Sign In
            </Button>
          </Paper>
        </Box>
      </Box>
    )
  }

  return (
    <Box sx={pageWrap}>
      <Box sx={{ width: "100%", maxWidth: 420, px: 2 }}>
        <BrandMark />
        <Paper sx={cardSx}>

          {step === 1 ? (
            <>
              <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>Forgot Password</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Enter your email to generate a reset token
              </Typography>
              <Box component="form" onSubmit={handleForgot}>
                <Stack spacing={2.5}>
                  <TextField
                    type="email" value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="Email address" required fullWidth
                    autoComplete="email"
                    {...inputProps}
                  />
                  {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}
                  <Button type="submit" variant="contained" fullWidth disabled={loading}
                    sx={{ py: 1.25, fontSize: "0.95rem", fontWeight: 600, borderRadius: 2, mt: 0.5 }}>
                    {loading ? "Sending…" : "Get Reset Token"}
                  </Button>
                </Stack>
              </Box>
              <Divider sx={{ my: 2.5, borderColor: "rgba(255,255,255,0.06)" }} />
              <Box sx={{ display: "flex", justifyContent: "center" }}>
                <Button variant="text" size="small" onClick={onBack}
                  sx={{ p: 0, minWidth: 0, color: "text.secondary", fontSize: "0.85rem",
                    "&:hover": { color: "primary.light", backgroundColor: "transparent", textDecoration: "underline" } }}>
                  ← Back to Sign In
                </Button>
              </Box>
            </>
          ) : (
            <>
              <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>Reset Password</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
                Enter your reset token and choose a new password
              </Typography>
              {devToken && (
                <Paper variant="outlined" sx={{ p: 1.5, mb: 2.5, border: "1px solid", borderColor: "success.main", bgcolor: "rgba(16,185,129,0.07)", borderRadius: 2 }}>
                  <Typography variant="caption" color="success.main" sx={{ textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, display: "block", mb: 0.5 }}>
                    Your reset token
                  </Typography>
                  <Typography component="code" sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.8rem", display: "block", mb: 0.5, wordBreak: "break-all" }}>
                    {devToken}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    In production this would be sent to your email
                  </Typography>
                </Paper>
              )}
              <Box component="form" onSubmit={handleReset}>
                <Stack spacing={2.5}>
                  <TextField value={token} onChange={e => setToken(e.target.value)}
                    placeholder="Paste reset token here" required fullWidth
                    slotProps={{ input: { sx: { fontFamily: "'JetBrains Mono', monospace", fontSize: "0.82rem" } } }}
                  />
                  <TextField type="password" value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="New password (min 6 characters)" required fullWidth
                    inputProps={{ minLength: 6 }} autoComplete="new-password"
                    {...inputProps}
                  />
                  <TextField type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                    placeholder="Confirm new password" required fullWidth
                    autoComplete="new-password"
                    {...inputProps}
                  />
                  {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}
                  <Button type="submit" variant="contained" fullWidth disabled={loading}
                    sx={{ py: 1.25, fontSize: "0.95rem", fontWeight: 600, borderRadius: 2, mt: 0.5 }}>
                    {loading ? "Resetting…" : "Reset Password"}
                  </Button>
                </Stack>
              </Box>
              <Divider sx={{ my: 2.5, borderColor: "rgba(255,255,255,0.06)" }} />
              <Box sx={{ display: "flex", justifyContent: "center" }}>
                <Button variant="text" size="small" onClick={() => { setStep(1); setError(null) }}
                  sx={{ p: 0, minWidth: 0, color: "text.secondary", fontSize: "0.85rem",
                    "&:hover": { color: "primary.light", backgroundColor: "transparent", textDecoration: "underline" } }}>
                  ← Back
                </Button>
              </Box>
            </>
          )}

        </Paper>
      </Box>
    </Box>
  )
}
