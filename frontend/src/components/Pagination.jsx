import Box from "@mui/material/Box"
import MuiPagination from "@mui/material/Pagination"
import Select from "@mui/material/Select"
import MenuItem from "@mui/material/MenuItem"
import Typography from "@mui/material/Typography"

export default function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange }) {
  const totalPages = Math.ceil(total / pageSize)
  if (totalPages <= 1) return null

  return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 2, py: 1.5, flexWrap: "wrap" }}>
      <MuiPagination
        count={totalPages}
        page={page}
        onChange={(_, p) => onPageChange(p)}
        color="primary"
        size="small"
        showFirstButton
        showLastButton
      />
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Typography variant="caption" color="text.secondary">{total} results</Typography>
        <Select
          value={pageSize}
          onChange={e => onPageSizeChange(Number(e.target.value))}
          size="small"
          sx={{ fontSize: "0.8rem", minWidth: 90 }}
        >
          <MenuItem value={10}>10/page</MenuItem>
          <MenuItem value={25}>25/page</MenuItem>
          <MenuItem value={50}>50/page</MenuItem>
        </Select>
      </Box>
    </Box>
  )
}
