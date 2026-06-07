import { useState, useEffect } from "react"
import { api } from "../api"
import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import Grid from "@mui/material/Grid"
import Card from "@mui/material/Card"
import CardActionArea from "@mui/material/CardActionArea"
import CardContent from "@mui/material/CardContent"
import Stack from "@mui/material/Stack"
import Chip from "@mui/material/Chip"

export default function PresetCards({ onSelect }) {
  const [presets, setPresets] = useState([])

  useEffect(() => {
    api.getPresets().then(data => setPresets(data.presets || [])).catch(() => {})
  }, [])

  if (presets.length === 0) return null

  return (
    <Box sx={{ my: 2 }}>
      <Typography variant="subtitle1" gutterBottom>Quick Start Presets</Typography>
      <Grid container spacing={1.5}>
        {presets.map(p => (
          <Grid item xs={12} sm={6} md={4} key={p.id}>
            <Card variant="outlined" sx={{ cursor: "pointer", "&:hover": { borderColor: "primary.main", transform: "translateY(-1px)" }, transition: "all 0.15s ease" }}>
              <CardActionArea onClick={() => onSelect(p)}>
                <CardContent sx={{ pb: 1.5 }}>
                  <Typography variant="subtitle2" gutterBottom>{p.name}</Typography>
                  <Typography variant="caption" color="text.secondary" display="block" mb={1} sx={{ lineHeight: 1.4 }}>{p.description}</Typography>
                  <Stack direction="row" sx={{ gap: 0.75, flexWrap: "wrap" }}>
                    <Chip label={p.universe?.toUpperCase()} size="small" variant="outlined" sx={{ fontSize: "0.7rem" }} />
                    <Chip label={`Top ${p.topN}`} size="small" variant="outlined" sx={{ fontSize: "0.7rem" }} />
                    <Chip label={`${p.rebalanceFrequency}d rebal`} size="small" variant="outlined" sx={{ fontSize: "0.7rem" }} />
                  </Stack>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  )
}
