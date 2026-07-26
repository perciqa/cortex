import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

export function StatusPill({ connected }: { connected: boolean }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
      <Box
        sx={{
          width: 8, height: 8, borderRadius: "50%",
          bgcolor: connected ? "#14b8a6" : "#f43f5e",
          boxShadow: connected
            ? "0 0 6px rgba(20,184,166,0.6)"
            : "0 0 6px rgba(244,63,94,0.6)",
        }}
      />
      <Typography variant="body2" sx={{ color: "#9ca3af" }}>
        {connected ? "Connected" : "Disconnected"}
      </Typography>
    </Box>
  );
}
