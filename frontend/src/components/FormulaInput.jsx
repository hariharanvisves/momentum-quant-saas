import { useState, useRef, useEffect } from "react"
import { api } from "../api"
import Box from "@mui/material/Box"
import Paper from "@mui/material/Paper"
import Typography from "@mui/material/Typography"
import Chip from "@mui/material/Chip"
import TextField from "@mui/material/TextField"

// Static fallback (used until API responds, and for intraday panel)
export const EOD_FACTORS = [
  // Performance
  "1 Month Performance",
  "3 Month Performance",
  "6 Month Performance",
  "9 Month Performance",
  "12 Month Performance",
  // Volatility
  "1 Month Volatility",
  "3 Month Volatility",
  "6 Month Volatility",
  "9 Month Volatility",
  "12 Month Volatility",
  // Price-level
  "52 Week High Ratio",
  "52 Week Low Ratio",
  "12 Minus 1 Month Performance",
  "Trend Efficiency",
]

/** Sort factor names numerically by their leading number (1, 3, 6, 9, 12). */
function sortFactors(items) {
  return [...items].sort((a, b) => {
    const na = parseInt(a) || 999
    const nb = parseInt(b) || 999
    return na - nb
  })
}

/** Group factors into categories for the pill bar. */
function groupFactors(factors) {
  const perf  = factors.filter(f => /Performance/.test(f) && !/Minus/.test(f) && !/Trend/.test(f))
  const vol   = factors.filter(f => /Volatility/.test(f))
  const price = factors.filter(f => /Week|Minus|Trend|Ratio/.test(f))
  return [
    { label: "Performance",   items: sortFactors(perf) },
    { label: "Volatility",    items: sortFactors(vol) },
    { label: "Price & Trend", items: price },
  ].filter(g => g.items.length > 0)
}

/** Returns the text the user is currently typing (since the last operator). */
function getCurrentFragment(text, cursorPos) {
  if (cursorPos <= 0) return ""
  const before = text.slice(0, cursorPos)
  const lastSep = Math.max(
    before.lastIndexOf("+"),
    before.lastIndexOf("-"),
    before.lastIndexOf("*"),
    before.lastIndexOf("/"),
    before.lastIndexOf("("),
    before.lastIndexOf(")"),
    before.lastIndexOf("%"),
  )
  return before.slice(lastSep + 1).trimStart()
}

function getFragmentStart(text, cursorPos) {
  if (cursorPos <= 0) return 0
  const before = text.slice(0, cursorPos)
  const lastSep = Math.max(
    before.lastIndexOf("+"),
    before.lastIndexOf("-"),
    before.lastIndexOf("*"),
    before.lastIndexOf("/"),
    before.lastIndexOf("("),
    before.lastIndexOf(")"),
    before.lastIndexOf("%"),
  )
  let start = lastSep + 1
  while (start < cursorPos && before[start] === " ") start++
  return start
}

function getSuggestions(text, cursorPos, factors) {
  const fragment = getCurrentFragment(text, cursorPos)
  if (!fragment || fragment.length < 1) return []
  const frag = fragment.toLowerCase()
  return factors.filter(f => {
    const fl = f.toLowerCase()
    return fl.startsWith(frag) || fl.includes(" " + frag)
  })
}

/**
 * Formula input with:
 * - Factors loaded dynamically from /api/factors (with static fallback)
 * - Autocomplete dropdown on typing
 * - Categorised pill buttons (Performance / Volatility / Price & Trend)
 *
 * Props: value, onChange(string), multiline, placeholder, className, style, rows
 */
export default function FormulaInput({
  value = "",
  onChange,
  multiline = false,
  placeholder,
  className,
  style,
  rows = 3,
}) {
  const [factors, setFactors] = useState(EOD_FACTORS)
  const [suggestions, setSuggestions] = useState([])
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef(null)

  useEffect(() => {
    api.getFactors()
      .then(data => {
        if (data.factors && data.factors.length > 0) setFactors(data.factors)
      })
      .catch(() => {}) // keep static fallback
  }, [])

  function handleChange(e) {
    const text = e.target.value
    const cursor = e.target.selectionStart
    onChange(text)
    setSuggestions(getSuggestions(text, cursor, factors))
    setActiveIdx(0)
  }

  function applySuggestion(factor) {
    const el = inputRef.current
    const cursor = el?.selectionStart ?? value.length
    const fragStart = getFragmentStart(value, cursor)
    const newText = value.slice(0, fragStart) + factor + value.slice(cursor)
    onChange(newText)
    setSuggestions([])
    setTimeout(() => {
      const newCursor = fragStart + factor.length
      el?.setSelectionRange(newCursor, newCursor)
      el?.focus()
    }, 0)
  }

  function insertFactor(factor) {
    const el = inputRef.current
    const cursor = el?.selectionStart ?? value.length
    const before = value.slice(0, cursor)
    const after = value.slice(cursor)
    const needSpaceBefore = before.length > 0 && !/[+\-*/( ]$/.test(before)
    const needSpaceAfter  = after.length > 0 && !/^[ +\-*/)]/.test(after)
    const newText =
      before +
      (needSpaceBefore ? " " : "") +
      factor +
      (needSpaceAfter ? " " : "") +
      after
    onChange(newText)
    setSuggestions([])
    setTimeout(() => {
      const newCursor = cursor + (needSpaceBefore ? 1 : 0) + factor.length + (needSpaceAfter ? 1 : 0)
      el?.setSelectionRange(newCursor, newCursor)
      el?.focus()
    }, 0)
  }

  function handleKeyDown(e) {
    if (suggestions.length === 0) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIdx(i => (i + 1) % suggestions.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIdx(i => (i - 1 + suggestions.length) % suggestions.length)
    } else if (e.key === "Tab") {
      e.preventDefault()
      applySuggestion(suggestions[activeIdx])
    } else if (e.key === "Escape") {
      setSuggestions([])
    }
  }

  function handleBlur() {
    setTimeout(() => setSuggestions([]), 150)
  }

  const sharedProps = {
    ref: inputRef,
    value,
    onChange: handleChange,
    onKeyDown: handleKeyDown,
    onBlur: handleBlur,
    placeholder,
    className,
    style,
  }

  const groups = groupFactors(factors)

  return (
    <Box sx={{ position: "relative", width: "100%" }}>
      <TextField
        inputRef={inputRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={placeholder}
        multiline={multiline}
        rows={multiline ? rows : undefined}
        fullWidth
        size="small"
        slotProps={{
          input: {
            sx: {
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "0.9rem",
              lineHeight: 1.6,
              color: "text.primary",
            },
          },
        }}
      />

      {suggestions.length > 0 && (
        <Paper
          elevation={8}
          sx={{
            position: "absolute",
            top: "calc(100% + 2px)",
            left: 0,
            right: 0,
            zIndex: 200,
            border: "1px solid",
            borderColor: "primary.main",
            borderRadius: 2,
            overflow: "hidden",
            maxHeight: 260,
            overflowY: "auto",
          }}
        >
          {suggestions.map((f, i) => {
            const firstSpace = f.indexOf(" ")
            const head = firstSpace > -1 ? f.slice(0, firstSpace) : f
            const tail = firstSpace > -1 ? f.slice(firstSpace) : ""
            return (
              <Box
                key={f}
                onMouseDown={e => { e.preventDefault(); applySuggestion(f) }}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  px: 1.75,
                  py: 1.1,
                  cursor: "pointer",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "0.85rem",
                  borderBottom: "1px solid",
                  borderColor: "divider",
                  backgroundColor: i === activeIdx ? "rgba(59,130,246,0.12)" : "transparent",
                  color: i === activeIdx ? "primary.light" : "text.primary",
                  "&:last-of-type": { borderBottom: 0 },
                  "&:hover": { backgroundColor: "rgba(59,130,246,0.1)", color: "primary.light" },
                }}
              >
                <Typography
                  component="span"
                  sx={{ color: "warning.main", fontWeight: 700, minWidth: 20, fontFamily: "'JetBrains Mono', monospace", fontSize: "0.85rem" }}
                >
                  {head}
                </Typography>
                {tail && <span>{tail}</span>}
              </Box>
            )
          })}
          <Box
            sx={{
              px: 1.25,
              py: 0.5,
              fontSize: "0.68rem",
              color: "text.secondary",
              borderTop: "1px solid",
              borderColor: "divider",
              backgroundColor: "rgba(0,0,0,0.2)",
            }}
          >
            Tab / click to insert
          </Box>
        </Paper>
      )}

      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75, mt: 1.5 }}>
        {groups.map(g => (
          <Box key={g.label} sx={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 0.5 }}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ textTransform: "uppercase", letterSpacing: "0.06em", mr: 0.5, whiteSpace: "nowrap", minWidth: 86, pt: 0.25 }}
            >
              {g.label}
            </Typography>
            {g.items.map(f => (
              <Chip
                key={f}
                label={f}
                size="small"
                variant="outlined"
                onMouseDown={e => { e.preventDefault(); insertFactor(f) }}
                title={`Insert "${f}"`}
                sx={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "0.72rem",
                  height: 24,
                  cursor: "pointer",
                  "& .MuiChip-label": { px: 0.75 },
                }}
              />
            ))}
          </Box>
        ))}
      </Box>
    </Box>
  )
}
