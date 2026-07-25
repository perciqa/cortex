import { useState } from "react";
import { Card, Title, Badge, Group, Stack, Text } from "@mantine/core";
import clsx from "clsx";

const TYPE_COLORS: Record<string, string> = {
  finding: "red", insight: "violet", warning: "orange",
  precedent: "blue", procedure: "teal",
};

export function ScopeFilter({ articles }: { articles: any[] }) {
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const types = ["all", ...new Set(articles.map(a => a.type))];
  const filtered = typeFilter === "all" ? articles : articles.filter(a => a.type === typeFilter);

  return (
    <div>
      <Title order={3} mb="md">Scope Filter</Title>
      <Group gap="xs" mb="md">
        {types.map(t => (
          <Badge key={t} color={t === "all" ? "gray" : TYPE_COLORS[t] || "gray"}
            variant={typeFilter === t ? "filled" : "outline"}
            style={{ cursor: "pointer" }} onClick={() => setTypeFilter(t)}>
            {t}
          </Badge>
        ))}
      </Group>
      <Stack gap="sm">
        {filtered.map(a => (
          <Card key={a.id} shadow="xs" withBorder radius="md" p="sm">
            <Group gap="sm">
              <Badge color={TYPE_COLORS[a.type] || "gray"} size="sm">{a.type}</Badge>
              <Text size="sm" style={{ flex: 1 }} lineClamp={1}>{a.content}</Text>
              <Text size="xs" c="dimmed">trust: {(a.trust_score ?? 0).toFixed(2)}</Text>
            </Group>
          </Card>
        ))}
      </Stack>
    </div>
  );
}
