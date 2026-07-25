import { Paper, Title, Text, Group, Badge, Stack, Box } from "@mantine/core";
import { IconSearch, IconBrain, IconUpload, IconCheck, IconAlertTriangle } from "@tabler/icons-react";
import type { Article } from "../state/store";

interface AgentActivityProps {
  activities: Article[];
}

const STEP_CONFIG: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  querying: { color: "blue", icon: <IconSearch size={14} />, label: "Querying" },
  reasoning: { color: "violet", icon: <IconBrain size={14} />, label: "Reasoning" },
  publishing: { color: "teal", icon: <IconUpload size={14} />, label: "Publishing" },
  completed: { color: "green", icon: <IconCheck size={14} />, label: "Completed" },
  error: { color: "red", icon: <IconAlertTriangle size={14} />, label: "Error" },
};

function ActivityEntry({ activity }: { activity: Article }) {
  const step = (activity.payload?.activity_step as string) || "querying";
  const config = STEP_CONFIG[step] || STEP_CONFIG.querying;
  const agentName = (activity.payload?.agent_name as string) || "Unknown Agent";
  const message = (activity.payload?.activity_message as string) || activity.content;

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
        </Box>
      </Group>
    </Paper>
  );
}

export function AgentActivity({ activities }: AgentActivityProps) {
  return (
    <Stack gap="md">
      <Title order={4}>Agent Activity</Title>
      {activities.length === 0 ? (
        <Paper p="xl" withBorder ta="center">
          <Text c="dimmed">No agent activity yet. Run an agent to see real-time steps.</Text>
        </Paper>
      ) : (
        <Stack gap="xs">
          {activities.map(a => (
            <ActivityEntry key={a.id} activity={a} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
