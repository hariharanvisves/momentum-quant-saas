import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import Tabs from "@mui/material/Tabs"
import Tab from "@mui/material/Tab"
import Chip from "@mui/material/Chip"
import Button from "@mui/material/Button"
import Tooltip from "@mui/material/Tooltip"
import Avatar from "@mui/material/Avatar"
import IconButton from "@mui/material/IconButton"

// Tab icons
import SearchIcon from "@mui/icons-material/Search"
import HistoryEduIcon from "@mui/icons-material/HistoryEdu"
import TuneIcon from "@mui/icons-material/Tune"
import RepeatIcon from "@mui/icons-material/Repeat"
import BookmarkIcon from "@mui/icons-material/Bookmark"
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet"
import SavingsIcon from "@mui/icons-material/Savings"
import BoltIcon from "@mui/icons-material/Bolt"
import LightModeIcon from "@mui/icons-material/LightMode"
import DarkModeIcon from "@mui/icons-material/DarkMode"
import PersonIcon from "@mui/icons-material/Person"

const TABS = [
  { id: "scanner",    label: "Scanner",    icon: <SearchIcon sx={{ fontSize: 16 }} /> },
  { id: "backtest",   label: "Backtest",   icon: <HistoryEduIcon sx={{ fontSize: 16 }} /> },
  { id: "optimizer",  label: "Optimizer",  icon: <TuneIcon sx={{ fontSize: 16 }} /> },
  { id: "rebalance",  label: "Rebalance",  icon: <RepeatIcon sx={{ fontSize: 16 }} /> },
  { id: "strategies", label: "Strategies", icon: <BookmarkIcon sx={{ fontSize: 16 }} /> },
  { id: "portfolio",  label: "Portfolio",  icon: <AccountBalanceWalletIcon sx={{ fontSize: 16 }} /> },
  { id: "sip",        label: "SIP Calc",   icon: <SavingsIcon sx={{ fontSize: 16 }} /> },
  { id: "intraday",   label: "Intraday",   icon: <BoltIcon sx={{ fontSize: 16 }} /> },
  { id: "profile",    label: "Profile",    icon: <PersonIcon sx={{ fontSize: 16 }} /> },
]

export default function Layout({ activeTab, onTabChange, user, onLogout, mode, onToggleTheme, children }) {
  const initials = user?.email?.slice(0, 2).toUpperCase() || "MQ"

  return (
    <Box className="app">
      {/* ── Header ── */}
      <Box
        component="header"
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 0,
          py: 2.5,
        }}
      >
        {/* Brand */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          {/* Logo mark */}
          <Box
            sx={{
              width: 38, height: 38, borderRadius: 2,
              background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
              boxShadow: "0 0 24px rgba(59,130,246,0.35)",
            }}
          >
            <Box
              component="span"
              sx={{ fontWeight: 900, fontSize: "1.05rem", color: "#fff", fontFamily: "'Outfit', sans-serif", lineHeight: 1, userSelect: "none" }}
            >
              M
            </Box>
          </Box>
          <Box>
            <Typography
              variant="h6"
              component="h1"
              sx={mode === "dark" ? {
                fontWeight: 800,
                fontSize: "1.15rem",
                lineHeight: 1.1,
                letterSpacing: "-0.03em",
                background: "linear-gradient(90deg, #f1f5f9 0%, #94a3b8 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              } : {
                fontWeight: 800,
                fontSize: "1.15rem",
                lineHeight: 1.1,
                letterSpacing: "-0.03em",
                color: "text.primary",
              }}
            >
              Momentum Quant
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary", letterSpacing: "0.02em", fontSize: "0.72rem" }}>
              NIFTY Momentum Scanner & Backtester
            </Typography>
          </Box>
        </Box>

        {/* User area */}
        {user && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mr: 0.5 }}>
              <Avatar
                sx={{
                  width: 32, height: 32,
                  fontSize: "0.7rem", fontWeight: 700,
                  background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
                  fontFamily: "'Outfit', sans-serif",
                  flexShrink: 0,
                }}
              >
                {initials}
              </Avatar>
              <Box sx={{ display: { xs: "none", sm: "flex" }, flexDirection: "column", alignItems: "flex-start", gap: 0.5 }}>
                <Typography
                  variant="caption"
                  component="p"
                  sx={{ color: "text.secondary", lineHeight: 1.2, fontFamily: "'Outfit', sans-serif", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {user.email}
                </Typography>
                <Chip
                  label={(user.plan || "free").toUpperCase()}
                  size="small"
                  color="primary"
                  sx={{
                    height: 18,
                    fontSize: "0.6rem",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    "& .MuiChip-label": { px: 1 },
                  }}
                />
              </Box>
            </Box>
            <Tooltip title={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"} arrow>
              <IconButton
                onClick={onToggleTheme}
                size="small"
                aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                sx={{ color: "text.secondary" }}
              >
                {mode === "dark" ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
            <Tooltip title="Sign out" arrow>
              <Button
                variant="outlined"
                size="small"
                color="error"
                onClick={onLogout}
                sx={{
                  minWidth: 0,
                  px: 1.5,
                  py: 0.5,
                  fontSize: "0.75rem",
                  "&:hover": { backgroundColor: "rgba(239,68,68,0.08)" },
                }}
              >
                Sign Out
              </Button>
            </Tooltip>
          </Box>
        )}
      </Box>

      {/* ── Navigation ── */}
      <Box
        sx={{
          borderTop: "1px solid",
          borderBottom: "1px solid",
          borderColor: "divider",
          mb: 3,
          mx: -2.5,
          px: 2.5,
        }}
      >
        <Tabs
          value={activeTab}
          onChange={(_, val) => onTabChange(val)}
          indicatorColor="primary"
          textColor="inherit"
          variant="scrollable"
          scrollButtons="auto"
        >
          {TABS.map((tab) => (
            <Tab
              key={tab.id}
              value={tab.id}
              icon={tab.icon}
              iconPosition="start"
              label={tab.label}
              sx={{
                gap: 0.75,
                minHeight: 48,
                px: 2,
                "& .MuiTab-iconWrapper": { mb: "0 !important" },
              }}
            />
          ))}
        </Tabs>
      </Box>

      <main>{children}</main>
    </Box>
  )
}
