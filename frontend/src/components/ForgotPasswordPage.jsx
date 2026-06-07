import { useState } from "react"
import { api } from "../api"
import Box from "@mui/material/Box"
import Paper from "@mui/material/Paper"
import Typography from "@mui/material/Typography"
import TextField from "@mui/material/TextField"
import Button from "@mui/material/Button"
import Alert from "@mui/material/Alert"
import Stack from "@mui/material/Stack"

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
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleReset(e) {
    e.preventDefault()
    if (password !== confirm) { setError("Passwords don't match"); return }
    setError(null)
    setLoading(true)
    try {
      const data = await api.resetPassword(token, password)
      setSuccess(data.message)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const cardSx = { p: 4, width: "100%", maxWidth: 400 }
  const pageWrap = { display: "flex", justifyContent: "center", alignItems: "center", minHeight: "80vh" }

  if (success) {
    return (
      <Box sx={pageWrap}>
        <Paper sx={cardSx}>
          <Typography variant="h5" fontWeight={700} mb={0.5}>Password Reset</Typography>
          <Typography color="success.main" mb={3}>{success}</Typography>
          <Button variant="contained" fullWidth onClick={onBack} sx={{ py: 1 }}>Back to Sign In</Button>
        </Paper>
      </Box>
    )
  }

  return (
    <Box sx={pageWrap}>
      <Paper sx={cardSx}>
        {step === 1 ? (
          <>
            <Typography variant="h5" fontWeight={700} mb={0.5}>Forgot Password</Typography>
            <Typography variant="body2" color="text.secondary" mb={3}>
              Enter your email to generate a reset token
            </Typography>
            <Box component="form" onSubmit={handleForgot}>
              <Stack spacing={2}>
                <TextField
                  label="Email" type="email" value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com" required fullWidth
                  slotProps={{ input: { sx: { fontFamily: "'Outfit', sans-serif" } } }}
                />
                {error && <Alert severity="error">{error}</Alert>}
                <Button type="submit" variant="contained" fullWidth disabled={loading} sx={{ py: 1 }}>
                  {loading ? "Generating token..." : "Get Reset Token"}
                </Button>
              </Stack>
            </Box>
            <Typography variant="body2" color="text.secondary" align="center" mt={2}>
              <Button variant="text" size="small" onClick={onBack} sx={{ textDecoration: "underline", p: 0, minWidth: 0 }}>
                ← Back to Sign In
              </Button>
            </Typography>
          </>
        ) : (
          <>
            <Typography variant="h5" fontWeight={700} mb={0.5}>Reset Password</Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>
              Enter your reset token and choose a new password
            </Typography>
            {devToken && (
              <Paper
                variant="outlined"
                sx={{ p: 1.5, mb: 2, border: "1px solid", borderColor: "success.main", bgcolor: "rgba(16,185,129,0.07)" }}
              >
                <Typography variant="caption" color="success.main" sx={{ textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, display: "block" }}>
                  Your reset token
                </Typography>
                <Typography
                  component="code"
                  sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.8rem", display: "block", my: 0.5, wordBreak: "break-all" }}
                >
                  {devToken}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  In production this would be sent to your email
                </Typography>
              </Paper>
            )}
            <Box component="form" onSubmit={handleReset}>
              <Stack spacing={2}>
                <TextField
                  label="Reset Token" value={token}
                  onChange={e => setToken(e.target.value)}
                  placeholder="Paste token here" required fullWidth
                  slotProps={{ input: { sx: { fontFamily: "'JetBrains Mono', monospace", fontSize: "0.8rem" } } }}
                />
                <TextField
                  label="New Password" type="password" value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Min 6 characters" required fullWidth
                  inputProps={{ minLength: 6 }}
                  slotProps={{ input: { sx: { fontFamily: "'Outfit', sans-serif" } } }}
                />
                <TextField
                  label="Confirm Password" type="password" value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Repeat password" required fullWidth
                  slotProps={{ input: { sx: { fontFamily: "'Outfit', sans-serif" } } }}
                />
                {error && <Alert severity="error">{error}</Alert>}
                <Button type="submit" variant="contained" fullWidth disabled={loading} sx={{ py: 1 }}>
                  {loading ? "Resetting..." : "Reset Password"}
                </Button>
              </Stack>
            </Box>
            <Typography variant="body2" color="text.secondary" align="center" mt={2}>
              <Button variant="text" size="small" onClick={() => { setStep(1); setError(null) }} sx={{ textDecoration: "underline", p: 0, minWidth: 0 }}>
                ← Back
              </Button>
            </Typography>
          </>
        )}
      </Paper>
    </Box>
  )
}
