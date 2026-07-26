import { Paper, Title, Text, Group, Badge, Stack, Box, Anchor, Divider } from "@mantine/core";
import { IconSearch, IconBrain, IconUpload, IconCheck, IconAlertTriangle } from "@tabler/icons-react";
import type { Article } from "../state/store";

interface AgentActivityProps {
  activities: Article[];
  onNavigate?: (path: string) => void;
}

const STEP_CONFIG: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  querying: { color: "blue", icon: <IconSearch size={14} />, label: "Querying" },
  reasoning: { color: "violet", icon: <IconBrain size={14} />, label: "Reasoning" },
  publishing: { color: "teal", icon: <IconUpload size={14} />, label: "Publishing" },
  completed: { color: "green", icon: <IconCheck size={14} />, label: "Completed" },
  error: { color: "red", icon: <IconAlertTriangle size={14} />, label: "Error" },
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

  return (
    <Paper p="sm" radius="md" withBorder style={{ borderLeft: `3px solid var(--mantine-color-${config.color}-6)` }}>
      <Group gap="sm" align="flex-start">
        <Badge
          color={config.color}
          variant="light"
          leftSection={config.icon}
          size="lg"
          tt="none"
        >
          {config.label}
        </Badge>
        <Box style={{ flex: 1 }}>
          <Group gap="xs" mb={4}>
            <Text fw={600} size="sm">{agentName}</Text>
          </Group>
          <Text size="sm" c="dimmed">{message}</Text>
          {step === "completed" && findingIds && findingIds.length > 0 && (
            <Group gap="xs" mt={4}>
              <Text size="xs" c="dimmed">Published:</Text>
              {findingIds.slice(0, 3).map(fid => (
                <Badge key={fid} size="xs" variant="outline" color="red"
                  style={{ cursor: "pointer" }}
                  onClick={() => onNavigate?.(`/article/${fid}`)}>
                  {fid.slice(0, 8)}…
                </Badge>
              ))}
              {insightId && (
                <Badge size="xs" variant="outline" color="violet"
                  style={{ cursor: "pointer" }}
                  onClick={() => onNavigate?.(`/article/${insightId}`)}>
                  insight {insightId.slice(0, 8)}…
                </Badge>
              )}
            </Group>
          )}
        </Box>
      </Group>
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
    <Stack gap="md">
      <Title order={4}>Agent Activity</Title>
      {activities.length === 0 ? (
        <Paper p="xl" withBorder ta="center">
          <Text c="dimmed">No agent activity yet. Run an agent to see real-time steps.</Text>
        </Paper>
      ) : (
        Object.entries(grouped).map(([agent, items]) => (
          <Paper key={agent} p="md" withBorder radius="md">
            <Group gap="xs" mb="sm">
              <Text fw={700}>{agent}</Text>
              <Badge size="sm" variant="light">{items.length} events</Badge>
            </Group>
            <Stack gap="xs">
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
