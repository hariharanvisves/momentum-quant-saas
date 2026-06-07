import { useState, useMemo } from "react"
import { ThemeProvider, createTheme } from "@mui/material/styles"
import CssBaseline from "@mui/material/CssBaseline"
import Box from "@mui/material/Box"
import CircularProgress from "@mui/material/CircularProgress"
import { AuthProvider, useAuth } from "./contexts/AuthContext"
import Layout from "./components/Layout"
import ScannerPanel from "./components/ScannerPanel"
import BacktestPanel from "./components/BacktestPanel"
import OptimizerPanel from "./components/OptimizerPanel"
import RebalancePanel from "./components/RebalancePanel"
import StrategiesPanel from "./components/StrategiesPanel"
import PortfolioManager from "./components/PortfolioManager"
import SipCalculator from "./components/SipCalculator"
import IntradayScoring from "./components/IntradayScoring"
import LoginPage from "./components/LoginPage"
import RegisterPage from "./components/RegisterPage"
import ForgotPasswordPage from "./components/ForgotPasswordPage"
import ErrorBoundary from "./components/ErrorBoundary"

function AppContent({ mode, onToggleTheme }) {
  const { user, loading, logout } = useAuth()
  const [tab, setTab] = useState("scanner")
  const [authMode, setAuthMode] = useState("login")

  if (loading) return (
    <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
      <CircularProgress />
    </Box>
  )

  if (!user) {
    if (authMode === "register") {
      return <RegisterPage onSwitchToLogin={() => setAuthMode("login")} />
    }
    if (authMode === "forgot") {
      return <ForgotPasswordPage onBack={() => setAuthMode("login")} />
    }
    return <LoginPage onSwitchToRegister={() => setAuthMode("register")} onForgotPassword={() => setAuthMode("forgot")} />
  }

  return (
    <Layout activeTab={tab} onTabChange={setTab} user={user} onLogout={logout} mode={mode} onToggleTheme={onToggleTheme}>
      <ErrorBoundary>
        {tab === "scanner" && <ScannerPanel />}
        {tab === "backtest" && <BacktestPanel />}
        {tab === "optimizer" && <OptimizerPanel />}
        {tab === "rebalance" && <RebalancePanel />}
        {tab === "strategies" && <StrategiesPanel />}
        {tab === "portfolio" && <PortfolioManager />}
        {tab === "sip" && <SipCalculator />}
        {tab === "intraday" && <IntradayScoring />}
      </ErrorBoundary>
    </Layout>
  )
}

export default function App() {
  const [mode, setMode] = useState(() => localStorage.getItem("themeMode") || "dark")

  const toggleTheme = () => {
    const next = mode === "dark" ? "light" : "dark"
    setMode(next)
    localStorage.setItem("themeMode", next)
  }

  const theme = useMemo(() => createTheme({
    palette: {
      mode,
      ...(mode === "dark" ? {
        background: {
          default: "#080d18",
          paper: "#0f1623",
        },
        primary: {
          main: "#3b82f6",
          light: "#60a5fa",
          dark: "#2563eb",
        },
        success: {
          main: "#10b981",
          light: "#34d399",
        },
        error: {
          main: "#ef4444",
          light: "#f87171",
        },
        warning: {
          main: "#f59e0b",
        },
        text: {
          primary: "#f1f5f9",
          secondary: "#64748b",
        },
        divider: "rgba(255,255,255,0.07)",
      } : {
        background: {
          default: "#f1f5f9",
          paper: "#ffffff",
        },
        primary: {
          main: "#3b82f6",
          light: "#60a5fa",
          dark: "#2563eb",
        },
        success: {
          main: "#10b981",
          light: "#059669",
        },
        error: {
          main: "#ef4444",
          light: "#dc2626",
        },
        warning: {
          main: "#f59e0b",
        },
      }),
    },
    shape: {
      borderRadius: 10,
    },
    typography: {
      fontFamily: "'Outfit', -apple-system, sans-serif",
      h5: { fontWeight: 800, letterSpacing: "-0.03em" },
      h6: { fontWeight: 700, letterSpacing: "-0.02em" },
      subtitle1: { fontWeight: 600, fontSize: "0.95rem" },
      subtitle2: { fontWeight: 600 },
      body2: { fontSize: "0.875rem" },
      caption: { fontSize: "0.75rem", letterSpacing: "0.01em" },
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: "none",
            fontFamily: "'Outfit', sans-serif",
            fontWeight: 600,
            letterSpacing: "0",
            borderRadius: 8,
          },
          contained: {
            boxShadow: "none",
            "&:hover": { boxShadow: "0 0 0 3px rgba(59,130,246,0.25)" },
          },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            textTransform: "none",
            fontFamily: "'Outfit', sans-serif",
            fontWeight: 500,
            fontSize: "0.875rem",
            minHeight: 48,
            padding: "6px 16px",
          },
        },
      },
      MuiTabs: {
        styleOverrides: {
          indicator: {
            height: 2,
            borderRadius: 1,
          },
        },
      },
      MuiInputBase: {
        defaultProps: { size: "small" },
        styleOverrides: {
          root: {
            fontSize: "0.875rem",
            transition: "background-color 0.15s ease",
          },
          input: {
            fontFamily: "'Outfit', sans-serif",
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: "none",
            borderRadius: 12,
          },
          elevation1: {
            boxShadow: "0 1px 2px rgba(0,0,0,0.4)",
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          head: {
            fontWeight: 600,
            fontFamily: "'Outfit', sans-serif",
            fontSize: "0.72rem",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            padding: "10px 16px",
          },
          body: {
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "0.85rem",
            padding: "10px 16px",
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            transition: "background-color 0.1s ease",
            "&:last-child td": { border: 0 },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            fontFamily: "'Outfit', sans-serif",
            borderRadius: 6,
          },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: {
            fontFamily: "'Outfit', sans-serif",
            borderRadius: 10,
            fontSize: "0.875rem",
          },
        },
      },
      MuiSwitch: {
        styleOverrides: {
          root: { padding: 6 },
          track: { borderRadius: 10, opacity: 1 },
          thumb: { boxShadow: "0 1px 4px rgba(0,0,0,0.4)" },
        },
      },
      MuiFormControlLabel: {
        styleOverrides: {
          label: {
            fontFamily: "'Outfit', sans-serif",
            fontSize: "0.875rem",
          },
        },
      },
      MuiSelect: {
        styleOverrides: {
          select: {
            paddingTop: "8px",
            paddingBottom: "8px",
          },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            fontFamily: "'Outfit', sans-serif",
            fontSize: "0.875rem",
          },
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: {
            fontFamily: "'Outfit', sans-serif",
            fontSize: "0.8rem",
          },
        },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: { borderRadius: 4, height: 3 },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            fontFamily: "'Outfit', sans-serif",
            fontSize: "0.75rem",
            borderRadius: 6,
            padding: "6px 10px",
          },
        },
      },
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            scrollbarWidth: "thin",
            "&::-webkit-scrollbar": { width: 6, height: 6 },
            "&::-webkit-scrollbar-thumb": { borderRadius: 3 },
            "&::-webkit-scrollbar-track": { backgroundColor: "transparent" },
          },
        },
      },
    },
  }), [mode])

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <AppContent mode={mode} onToggleTheme={toggleTheme} />
      </AuthProvider>
    </ThemeProvider>
  )
}
