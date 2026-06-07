import { Component } from "react"
import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import Button from "@mui/material/Button"
import Paper from "@mui/material/Paper"

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh", p: 3 }}>
          <Paper sx={{ p: 4, maxWidth: 500, textAlign: "center" }}>
            <Typography variant="h5" color="error" gutterBottom>Something went wrong</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3, fontFamily: "monospace", fontSize: "0.75rem" }}>
              {this.state.error?.message || "Unknown error"}
            </Typography>
            <Button variant="contained" onClick={() => this.setState({ hasError: false, error: null })}>
              Try Again
            </Button>
            <Button variant="text" sx={{ ml: 1 }} onClick={() => window.location.reload()}>
              Reload Page
            </Button>
          </Paper>
        </Box>
      )
    }
    return this.props.children
  }
}
