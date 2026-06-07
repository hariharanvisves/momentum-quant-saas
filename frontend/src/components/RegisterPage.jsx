import { useState } from "react"
import { useAuth } from "../contexts/AuthContext"
import Box from "@mui/material/Box"
import Paper from "@mui/material/Paper"
import Typography from "@mui/material/Typography"
import TextField from "@mui/material/TextField"
import Button from "@mui/material/Button"
import Alert from "@mui/material/Alert"
import Stack from "@mui/material/Stack"

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
    <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "80vh" }}>
      <Paper sx={{ p: 4, width: "100%", maxWidth: 400 }}>
        <Typography variant="h5" fontWeight={700} mb={0.5}>Create Account</Typography>
        <Typography variant="body2" color="text.secondary" mb={3}>
          Start tracking momentum strategies
        </Typography>
        <Box component="form" onSubmit={handleSubmit}>
          <Stack spacing={2}>
            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              fullWidth
              slotProps={{ input: { sx: { fontFamily: "'Outfit', sans-serif" } } }}
            />
            <TextField
              label="Password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Min 6 characters"
              required
              inputProps={{ minLength: 6 }}
              fullWidth
              slotProps={{ input: { sx: { fontFamily: "'Outfit', sans-serif" } } }}
            />
            <TextField
              label="Confirm Password"
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Repeat password"
              required
              fullWidth
              slotProps={{ input: { sx: { fontFamily: "'Outfit', sans-serif" } } }}
            />
            {error && <Alert severity="error">{error}</Alert>}
            <Button
              type="submit"
              variant="contained"
              fullWidth
              disabled={loading}
              sx={{ py: 1, fontSize: "1rem" }}
            >
              {loading ? "Creating..." : "Create Account"}
            </Button>
          </Stack>
        </Box>
        <Typography variant="body2" color="text.secondary" align="center" mt={2}>
          Already have an account?{" "}
          <Button variant="text" size="small" onClick={onSwitchToLogin} sx={{ textDecoration: "underline", p: 0, minWidth: 0 }}>Sign In</Button>
        </Typography>
      </Paper>
    </Box>
  )
}
