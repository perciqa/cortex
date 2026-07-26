import { Card, Group, Text, Title, Badge } from "@mantine/core";

const ORG_MAP: Record<string, string> = {
  "did:percq:org:soc-alpha": "soc-alpha",
  "did:percq:org:soc-beta": "soc-beta",
};

export function FabricOverview({ tenants, events }: { tenants: { slug: string }[]; events: any[] }) {
  const articles = events.filter(e => e.data?.article?.id);
  return (
    <div>
      <Title order={3} mb="md">Fabric Overview</Title>
      <Group gap="md">
        {tenants.map(t => {
          const count = articles.filter(e => {
            const srcOrg = e.data?.src_org || "";
            const slug = ORG_MAP[srcOrg] || srcOrg;
            return slug === t.slug || (!srcOrg && t.slug === "soc-alpha");
          }).length;
          return (
            <Card key={t.slug} shadow="xs" withBorder radius="md" style={{ flex: 1 }}>
              <Group justify="space-between" mb="xs">
                <Text fw={700}>{t.slug}</Text>
                <Badge variant="light">{count}</Badge>
              </Group>
              <Text size="sm" c="dimmed">{count} articles</Text>
            </Card>
          );
        })}
        <Card shadow="xs" withBorder radius="md" style={{ flex: 1 }}>
          <Group justify="space-between" mb="xs">
            <Text fw={700}>Total</Text>
            <Badge variant="light" color="green">{articles.length}</Badge>
          </Group>
          <Text size="sm" c="dimmed">{articles.length} articles</Text>
        </Card>
      </Group>
    </div>
  );
}
