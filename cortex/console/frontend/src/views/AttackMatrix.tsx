import { useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { ATTACK_TECHNIQUES } from "../data/attackTechniques";

export interface AttackMatrixProps {
  counts: Record<string, number>;
  articlesFor: (id: string) => { id: string; content: string }[];
}

const SEVERITY_COLORS: Record<string, string> = { critical: "error", high: "warning", medium: "warning", low: "info" };

export function AttackMatrix({ counts, articlesFor }: AttackMatrixProps) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 3 }}>
        Attack Matrix
      </Typography>
      <Card variant="outlined" sx={{ borderRadius: 2 }}>
        <CardContent>
          <Stack spacing={1}>
            {Object.entries(counts).sort().map(([id, count]) => {
              const tech = ATTACK_TECHNIQUES[id];
              const color = SEVERITY_COLORS[tech?.severity || ""] || "default";
              return (
                <Stack
                  key={id}
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  spacing={1.5}
                  sx={{ cursor: "pointer" }}
                  onClick={() => setSelected(id)}
                >
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: `${color}.main` }} />
                    <Typography variant="body2">{tech?.name || id}</Typography>
                  </Stack>
                  <Chip label={count} color={color as any} size="small" />
                </Stack>
              );
            })}
          </Stack>
        </CardContent>
      </Card>
      <Dialog open={!!selected} onClose={() => setSelected(null)}>
        <DialogTitle>{selected ? ATTACK_TECHNIQUES[selected]?.name || selected : ""}</DialogTitle>
        <DialogContent>
          {selected && articlesFor(selected).map(a => (
            <DialogContentText key={a.id} sx={{ mb: 1 }}>{a.content}</DialogContentText>
          ))}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
