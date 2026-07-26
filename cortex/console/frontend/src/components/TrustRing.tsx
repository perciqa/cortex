import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";

export function TrustRing({ pct }: { pct: number }) {
  const value = Math.round(pct * 100);
  const color = pct > 0.7 ? "#14b8a6" : pct > 0.4 ? "#f59e0b" : "#f43f5e";
  return (
    <Box sx={{ position: "relative", display: "inline-flex" }}>
      <CircularProgress
        variant="determinate"
        value={value}
        size={48}
        thickness={4}
        sx={{ color, "& .MuiCircularProgress-track": { color: "#2a2a2e" } }}
      />
      <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Typography variant="caption" sx={{ fontWeight: 700, color, fontSize: "0.75rem" }}>
          {value}
        </Typography>
      </Box>
    </Box>
  );
}
