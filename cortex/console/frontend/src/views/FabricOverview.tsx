import { Card, Group, Text, Title } from "@mantine/core";

export function FabricOverview({ tenants, events }: { tenants: { slug: string }[]; events: any[] }) {
  return (
    <div>
      <Title order={3} mb="md">Fabric Overview</Title>
      <Group gap="md">
        {tenants.map(t => (
          <Card key={t.slug} shadow="xs" withBorder radius="md" style={{ flex: 1 }}>
            <Text fw={700}>{t.slug}</Text>
            <Text size="sm" c="dimmed">{events.filter(e => e.data?.article?.id).length} articles</Text>
          </Card>
        ))}
      </Group>
    </div>
  );
}
