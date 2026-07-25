import { useState } from "react";
import { Card, Title, Badge, Group, Stack, Text, Modal } from "@mantine/core";
import clsx from "clsx";
import { ATTACK_TECHNIQUES } from "../data/attackTechniques";

export interface AttackMatrixProps {
  counts: Record<string, number>;
  articlesFor: (id: string) => { id: string; content: string }[];
}

const SEVERITY_COLORS: Record<string, string> = { critical: "red", high: "orange", medium: "yellow", low: "blue" };

export function AttackMatrix({ counts, articlesFor }: AttackMatrixProps) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div>
      <Title order={3} mb="md">Attack Matrix</Title>
      <Card shadow="xs" withBorder radius="md" p="md">
        <Stack gap="xs">
          {Object.entries(counts).sort().map(([id, count]) => {
            const tech = ATTACK_TECHNIQUES[id];
            const color = SEVERITY_COLORS[tech?.severity || ""] || "gray";
            return (
              <Group key={id} gap="sm" justify="space-between" style={{ cursor: "pointer" }}
                onClick={() => setSelected(id)}>
                <Group gap="xs">
                  <Badge color={color} variant="dot" size="sm" />
                  <Text size="sm">{tech?.name || id}</Text>
                </Group>
                <Badge color={color}>{count}</Badge>
              </Group>
            );
          })}
        </Stack>
      </Card>
      <Modal opened={!!selected} onClose={() => setSelected(null)} title={selected ? ATTACK_TECHNIQUES[selected]?.name || selected : ""}>
        {selected && articlesFor(selected).map(a => (
          <Text key={a.id} size="sm" mb="xs">{a.content}</Text>
        ))}
      </Modal>
    </div>
  );
}
