import { createTheme } from "@mui/material/styles"

const theme = createTheme({
  palette: {
    mode: "dark",
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
        outlined: {
          borderColor: "rgba(255,255,255,0.12)",
          "&:hover": { borderColor: "rgba(255,255,255,0.25)", backgroundColor: "rgba(255,255,255,0.04)" },
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
          color: "#64748b",
          "&.Mui-selected": { color: "#f1f5f9", fontWeight: 600 },
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
          backgroundColor: "rgba(255,255,255,0.03)",
          "&:hover": { backgroundColor: "rgba(255,255,255,0.05)" },
          transition: "background-color 0.15s ease",
        },
        input: {
          fontFamily: "'Outfit', sans-serif",
          "&::placeholder": { color: "#334155", opacity: 1 },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "rgba(255,255,255,0.08)",
            transition: "border-color 0.15s ease",
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "rgba(59,130,246,0.5)",
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: "#3b82f6",
            borderWidth: 1.5,
          },
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          fontFamily: "'Outfit', sans-serif",
          fontSize: "0.8rem",
          color: "#475569",
          "&.Mui-focused": { color: "#60a5fa" },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          border: "1px solid rgba(255,255,255,0.06)",
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
          color: "#475569",
          fontWeight: 600,
          fontFamily: "'Outfit', sans-serif",
          fontSize: "0.72rem",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          padding: "10px 16px",
          backgroundColor: "rgba(255,255,255,0.02)",
        },
        body: {
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: "0.85rem",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
          padding: "10px 16px",
          color: "#cbd5e1",
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          transition: "background-color 0.1s ease",
          "&:last-child td": { border: 0 },
          "&:hover td": { backgroundColor: "rgba(59,130,246,0.04)" },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontFamily: "'Outfit', sans-serif",
          borderRadius: 6,
        },
        outlined: {
          borderColor: "rgba(255,255,255,0.12)",
          color: "#94a3b8",
          "&:hover": {
            borderColor: "rgba(59,130,246,0.5)",
            backgroundColor: "rgba(59,130,246,0.08)",
            color: "#93c5fd",
          },
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
        root: {
          padding: 6,
        },
        track: {
          borderRadius: 10,
          backgroundColor: "rgba(255,255,255,0.22)",
          opacity: 1,
        },
        thumb: {
          boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
        },
        switchBase: {
          "&.Mui-checked + .MuiSwitch-track": {
            opacity: 1,
          },
        },
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
          "&:hover": { backgroundColor: "rgba(59,130,246,0.1)" },
          "&.Mui-selected": { backgroundColor: "rgba(59,130,246,0.15)", "&:hover": { backgroundColor: "rgba(59,130,246,0.2)" } },
        },
      },
    },
    MuiPagination: {
      styleOverrides: {
        root: { fontFamily: "'Outfit', sans-serif" },
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
          backgroundColor: "#1e293b",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 6,
          padding: "6px 10px",
        },
        arrow: { color: "#1e293b" },
      },
    },
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          scrollbarWidth: "thin",
          scrollbarColor: "rgba(255,255,255,0.15) transparent",
          "&::-webkit-scrollbar": { width: 6, height: 6 },
          "&::-webkit-scrollbar-thumb": { backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 3 },
          "&::-webkit-scrollbar-track": { backgroundColor: "transparent" },
        },
      },
    },
  },
})

export default theme
