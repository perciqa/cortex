import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import Search from "@mui/icons-material/Search";
import Psychology from "@mui/icons-material/Psychology";
import Publish from "@mui/icons-material/Publish";
import CheckCircleOutline from "@mui/icons-material/CheckCircleOutline";
import WarningAmber from "@mui/icons-material/WarningAmber";
import AutoAwesome from "@mui/icons-material/AutoAwesome";
import type { Article } from "../state/store";

interface AgentActivityProps {
  activities: Article[];
  onNavigate?: (path: string) => void;
}

const STEP_CONFIG: Record<string, { color: string; icon: React.ReactElement; label: string }> = {
  querying: { color: "primary", icon: <Search />, label: "Querying" },
  reasoning: { color: "secondary", icon: <Psychology />, label: "Reasoning" },
  publishing: { color: "success", icon: <Publish />, label: "Publishing" },
  completed: { color: "success", icon: <CheckCircleOutline />, label: "Completed" },
  error: { color: "error", icon: <WarningAmber />, label: "Error" },
};

const ORG_LABELS: Record<string, string> = {
  "did:percq:org:soc-alpha": "SOC Alpha",
  "did:percq:org:soc-beta": "SOC Beta",
};

function ActivityEntry({ activity, onNavigate }: { activity: Article; onNavigate?: (path: string) => void }) {
  const step = (activity.payload?.activity_step as string) || "querying";
  const config = STEP_CONFIG[step] || STEP_CONFIG.querying;
  const agentName = (activity.payload?.agent_name as string) || "Unknown Agent";
  const message = (activity.payload?.activity_message as string) || activity.content;
  const findingIds = activity.payload?.finding_ids as string[] | undefined;
  const insightId = activity.payload?.insight_id as string | undefined;
  const isReasoning = step === "reasoning";

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.5,
        borderLeft: isReasoning ? "4px solid" : "3px solid",
        borderLeftColor: isReasoning ? "secondary.main" : `${config.color}.main`,
        background: isReasoning
          ? "linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(168,85,247,0.05) 100%)"
          : undefined,
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="flex-start">
        <Chip
          label={isReasoning ? "LLM Reasoning" : config.label}
          color={config.color as any}
          variant={isReasoning ? "filled" : "outlined"}
          icon={isReasoning ? <AutoAwesome /> : config.icon}
          size="small"
          sx={{ textTransform: "none", flexShrink: 0 }}
        />
        <Box sx={{ flex: 1 }}>
          <Stack direction="row" spacing={0.5} sx={{ mb: 0.5, alignItems: "center" }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{agentName}</Typography>
            {isReasoning && (
              <Chip label="Gemma 4 12B · vLLM · ROCm" variant="outlined" color="secondary" size="small"
                sx={{ textTransform: "none" }} />
            )}
          </Stack>
          <Typography variant="body2" sx={{ color: isReasoning ? "secondary.main" : "text.secondary" }}>
            {message}
          </Typography>
          {step === "completed" && findingIds && findingIds.length > 0 && (
            <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: "wrap", alignItems: "center" }}>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>Published:</Typography>
              {findingIds.slice(0, 3).map(fid => (
                <Chip key={fid} label={`${fid.slice(0, 8)}…`} variant="outlined" color="error" size="small"
                  sx={{ cursor: "pointer" }}
                  onClick={() => onNavigate?.(`/article/${fid}`)} />
              ))}
              {insightId && (
                <Chip label={`insight ${insightId.slice(0, 8)}…`} variant="outlined" color="secondary" size="small"
                  sx={{ cursor: "pointer" }}
                  onClick={() => onNavigate?.(`/article/${insightId}`)} />
              )}
            </Stack>
          )}
        </Box>
      </Stack>
    </Paper>
  );
}

export function AgentActivity({ activities, onNavigate }: AgentActivityProps) {
  const grouped: Record<string, Article[]> = {};
  for (const a of activities) {
    const agent = (a.payload?.agent_name as string) || "Unknown";
    if (!grouped[agent]) grouped[agent] = [];
    grouped[agent].push(a);
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h6">Agent Activity</Typography>
      {activities.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 3, textAlign: "center" }}>
          <Typography sx={{ color: "text.secondary" }}>No agent activity yet. Run an agent to see real-time steps.</Typography>
        </Paper>
      ) : (
        Object.entries(grouped).map(([agent, items]) => (
          <Paper key={agent} variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" spacing={1} sx={{ mb: 1.5, alignItems: "center" }}>
              <Typography sx={{ fontWeight: 700 }}>{agent}</Typography>
              <Chip label={`${items.length} events`} variant="outlined" size="small" />
            </Stack>
            <Stack spacing={1}>
              {items.map(a => (
                <ActivityEntry key={a.id} activity={a} onNavigate={onNavigate} />
              ))}
            </Stack>
          </Paper>
        ))
      )}
    </Stack>
  );
}
