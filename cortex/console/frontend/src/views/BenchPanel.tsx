import { Card, Title, Text, Group, Badge, Stack } from "@mantine/core";

export function BenchPanel({ byNode }: { byNode: Record<string, any[]> }) {
  const nodes = Object.keys(byNode);
  return (
    <div>
      <Title order={3} mb="md">Bench Panel</Title>
      {nodes.length === 0 ? (
        <Card shadow="xs" withBorder radius="md" p="xl">
          <Text ta="center" c="dimmed">No metrics received yet. Metrics are sent every ~2s while nodes are active.</Text>
        </Card>
      ) : (
        <Stack gap="md">
          {nodes.map(node => {
            const samples = byNode[node];
            const latest = samples[samples.length - 1];
            return (
              <Card key={node} shadow="xs" withBorder radius="md">
                <Group gap="sm" mb="sm">
                  <Text fw={700}>{node}</Text>
                  <Badge color="green" variant="dot" size="sm">live</Badge>
                </Group>
                {latest && (
                  <Group gap="lg">
                    <div><Text size="sm" c="dimmed">Embeds/s (GPU)</Text><Text>{latest.embeds_per_sec_radeon?.toFixed(1) || "—"}</Text></div>
                    <div><Text size="sm" c="dimmed">Embeds/s (CPU)</Text><Text>{latest.embeds_per_sec_cpu?.toFixed(1) || "—"}</Text></div>
                    <div><Text size="sm" c="dimmed">Queries/s (GPU)</Text><Text>{latest.queries_per_sec_radeon?.toFixed(1) || "—"}</Text></div>
                    <div><Text size="sm" c="dimmed">GPU mem</Text><Text>{latest.gpu_mem_util_pct?.toFixed(0) || "—"}%</Text></div>
                    <div><Text size="sm" c="dimmed">P95 latency</Text><Text>{latest.p95_query_latency_ms?.toFixed(0) || "—"}ms</Text></div>
                  </Group>
                )}
              </Card>
            );
          })}
        </Stack>
      )}
    </div>
  );
}
