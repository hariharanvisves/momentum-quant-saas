import { useState } from "react"
import { ThemeProvider } from "@mui/material/styles"
import CssBaseline from "@mui/material/CssBaseline"
import Box from "@mui/material/Box"
import CircularProgress from "@mui/material/CircularProgress"
import theme from "./theme"
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

function AppContent() {
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
    <Layout activeTab={tab} onTabChange={setTab} user={user} onLogout={logout}>
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
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  )
}
