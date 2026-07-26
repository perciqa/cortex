import { Card, Title, Text, Group, Badge, Stack, SimpleGrid, Progress } from "@mantine/core";
import type { Article } from "../state/store";

interface BenchPanelProps {
  byNode: Record<string, any[]>;
  articles: Article[];
  activities: Article[];
  connected: boolean;
}

const TYPE_COLORS: Record<string, string> = {
  finding: "red",
  insight: "violet",
  warning: "orange",
  precedent: "blue",
  procedure: "teal",
  activity: "gray",
};

const ORG_LABELS: Record<string, string> = {
  "did:percq:org:soc-alpha": "SOC Alpha",
  "did:percq:org:soc-beta": "SOC Beta",
};

export function BenchPanel({ byNode, articles, activities, connected }: BenchPanelProps) {
  const nodes = Object.keys(byNode);
  const allArticles = [...articles, ...activities];

  const byType: Record<string, number> = {};
  for (const a of allArticles) byType[a.type] = (byType[a.type] || 0) + 1;

  const byOrg: Record<string, number> = {};
  for (const a of allArticles) {
    const org = a.src_org || "unknown";
    byOrg[org] = (byOrg[org] || 0) + 1;
  }

  const total = allArticles.length;

  return (
    <Stack gap="md">
      <Title order={3}>Bench Panel</Title>

      <Card shadow="xs" withBorder radius="md">
        <Group gap="sm" mb="sm">
          <Badge color={connected ? "green" : "red"} variant="dot">WebSocket {connected ? "connected" : "disconnected"}</Badge>
        </Group>
        <SimpleGrid cols={3}>
          <div>
            <Text size="xs" c="dimmed">Total Articles</Text>
            <Text fw={700} size="xl">{total}</Text>
          </div>
          <div>
            <Text size="xs" c="dimmed">Findings</Text>
            <Text fw={700} size="xl" c="red">{byType.finding || 0}</Text>
          </div>
          <div>
            <Text size="xs" c="dimmed">Insights</Text>
            <Text fw={700} size="xl" c="violet">{byType.insight || 0}</Text>
          </div>
        </SimpleGrid>
      </Card>

      <Card shadow="xs" withBorder radius="md">
        <Text fw={700} size="sm" mb="sm">By Organization</Text>
        <Stack gap="xs">
          {Object.entries(byOrg).map(([org, count]) => {
            const label = ORG_LABELS[org] || org;
            const pct = total > 0 ? (count / total) * 100 : 0;
            return (
              <div key={org}>
                <Group justify="space-between" mb={2}>
                  <Text size="sm">{label}</Text>
                  <Text size="sm" c="dimmed">{count} ({pct.toFixed(0)}%)</Text>
                </Group>
                <Progress value={pct} size="sm" color={org.includes("alpha") ? "blue" : "orange"} />
              </div>
            );
          })}
        </Stack>
      </Card>

      <Card shadow="xs" withBorder radius="md">
        <Text fw={700} size="sm" mb="sm">By Article Type</Text>
        <Group gap="xs" wrap="wrap">
          {Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
            <Badge key={type} color={TYPE_COLORS[type] || "gray"} variant="light" size="lg">
              {type}: {count}
            </Badge>
          ))}
        </Group>
      </Card>

      {nodes.length > 0 && (
        <Card shadow="xs" withBorder radius="md">
          <Text fw={700} size="sm" mb="sm">Connected Nodes</Text>
          <Stack gap="xs">
            {nodes.map(node => {
              const samples = byNode[node];
              const latest = samples[samples.length - 1];
              return (
                <Group key={node} gap="sm">
                  <Badge color="green" variant="dot">{node}</Badge>
                  {latest && (
                    <Text size="xs" c="dimmed">
                      embeds: {latest.embeds_per_sec_radeon?.toFixed(1) || "—"} | 
                      GPU mem: {latest.gpu_mem_util_pct?.toFixed(0) || "—"}%
                    </Text>
                  )}
                </Group>
              );
            })}
          </Stack>
        </Card>
      )}
    </Stack>
  );
}
