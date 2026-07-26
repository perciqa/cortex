import { useState } from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

const TYPE_COLORS: Record<string, string> = {
  finding: "error", insight: "secondary", warning: "warning",
  precedent: "info", procedure: "success",
};

export function ScopeFilter({ articles }: { articles: any[] }) {
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const types = ["all", ...new Set(articles.map(a => a.type))];
  const filtered = typeFilter === "all" ? articles : articles.filter(a => a.type === typeFilter);

  return (
    <div>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 700 }}>Scope Filter</Typography>
      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: "wrap" }}>
        {types.map(t => (
          <Chip key={t} label={t}
            color={t === "all" ? "default" : (TYPE_COLORS[t] as any) || "default"}
            variant={typeFilter === t ? "filled" : "outlined"}
            onClick={() => setTypeFilter(t)}
            sx={{ cursor: "pointer" }} />
        ))}
      </Stack>
      <Stack spacing={1.5}>
        {filtered.map(a => (
          <Card key={a.id} variant="outlined">
            <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Chip label={a.type} color={(TYPE_COLORS[a.type] as any) || "default"} size="small" />
                <Typography variant="body2" sx={{
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>{a.content}</Typography>
                <Typography variant="caption" sx={{ color: "text.secondary", flexShrink: 0 }}>
                  trust: {(a.trust_score ?? 0).toFixed(2)}
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>
    </div>
  );
}
