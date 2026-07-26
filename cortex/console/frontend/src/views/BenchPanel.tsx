import { useState, useEffect } from "react";
import { Card, Title, Text, Group, Badge, Stack, SimpleGrid, Progress, RingProgress, Tooltip } from "@mantine/core";
import { IconBrandAmd, IconCpu, IconRipple, IconDeviceDesktopAnalytics } from "@tabler/icons-react";
import type { Article } from "../state/store";

interface BenchPanelProps {
  byNode: Record<string, any[]>;
  articles: Article[];
  activities: Article[];
  connected: boolean;
}

interface RocmInfo {
  mem_util_pct: number;
  device_name: string;
  sensor_backend: string;
  hip_version: string | null;
  torch_version: string | null;
  rocm_active: boolean;
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

function GpuStatusCard({ rocm }: { rocm: RocmInfo | null }) {
  if (!rocm || !rocm.rocm_active) {
    return (
      <Card shadow="xs" withBorder radius="md">
        <Group gap="sm" mb="sm">
          <IconDeviceDesktopAnalytics size={20} />
          <Text fw={700}>GPU Status</Text>
        </Group>
        <Badge color="gray" variant="light" size="lg">No GPU detected</Badge>
        <Text size="sm" c="dimmed" mt="xs">Running on CPU fallback</Text>
      </Card>
    );
  }

  const vramPct = Math.min(rocm.mem_util_pct, 100);
  const vramColor = vramPct > 80 ? "red" : vramPct > 50 ? "yellow" : "teal";

  return (
    <Card shadow="xs" withBorder radius="md">
      <Group gap="sm" mb="md">
        <IconBrandAmd size={24} color="var(--mantine-color-red-6)" />
        <div style={{ flex: 1 }}>
          <Group gap="xs">
            <Text fw={700} size="sm">{rocm.device_name}</Text>
            <Badge color="green" variant="dot" size="sm">{rocm.sensor_backend}</Badge>
          </Group>
          <Group gap="xs" mt={2}>
            <Text size="xs" c="dimmed">HIP {rocm.hip_version || "—"}</Text>
            <Text size="xs" c="dimmed">·</Text>
            <Text size="xs" c="dimmed">torch {rocm.torch_version || "—"}</Text>
          </Group>
        </div>
        <RingProgress
          size={60}
          thickness={6}
          roundCaps
          sections={[{ value: vramPct, color: vramColor }]}
          label={<Text size="xs" fw={700} ta="center">{vramPct.toFixed(0)}%</Text>}
        />
      </Group>
      <Progress value={vramPct} size="sm" color={vramColor} />
      <Text size="xs" c="dimmed" mt={4}>VRAM utilization</Text>
    </Card>
  );
}

function NodeMetricsCard({ node, samples }: { node: string; samples: any[] }) {
  const latest = samples[samples.length - 1];
  if (!latest) return null;

  const radeon = latest.embeds_per_sec_radeon ?? 0;
  const cpuEmb = latest.embeds_per_sec_cpu ?? 0;
  const p95 = latest.p95_query_latency_ms ?? 0;
  const gpuMem = latest.gpu_mem_util_pct ?? 0;
  const deviceName = latest.gpu_device_name;
  const sensorBackend = latest.gpu_sensor_backend;
  const maxRate = Math.max(radeon, cpuEmb, 1);
  const radeonPct = (radeon / maxRate) * 100;
  const cpuPct = (cpuEmb / maxRate) * 100;

  return (
    <Card shadow="xs" withBorder radius="md">
      <Group gap="sm" mb="sm">
        <Badge color="green" variant="dot" size="lg">{node}</Badge>
        {deviceName && sensorBackend && (
          <Tooltip label={`${deviceName} · ${sensorBackend}`}>
            <IconBrandAmd size={16} color="var(--mantine-color-red-6)" />
          </Tooltip>
        )}
      </Group>

      <Stack gap="xs">
        <div>
          <Group justify="space-between" mb={2}>
            <Group gap={4}>
              <IconBrandAmd size={14} color="var(--mantine-color-red-6)" />
              <Text size="xs">Radeon</Text>
            </Group>
            <Text size="xs" fw={600}>{radeon.toFixed(1)} embeds/s</Text>
          </Group>
          <Progress value={radeonPct} size="md" color="red" />
        </div>

        <div>
          <Group justify="space-between" mb={2}>
            <Group gap={4}>
              <IconCpu size={14} />
              <Text size="xs">CPU</Text>
            </Group>
            <Text size="xs" fw={600}>{cpuEmb.toFixed(1)} embeds/s</Text>
          </Group>
          <Progress value={cpuPct} size="md" color="blue" />
        </div>

        <Group gap="xs" mt="xs">
          <IconRipple size={14} />
          <Text size="xs" c="dimmed">p95 latency: {p95.toFixed(1)} ms</Text>
          <Text size="xs" c="dimmed">·</Text>
          <Text size="xs" c="dimmed">GPU mem: {gpuMem.toFixed(0)}%</Text>
        </Group>
      </Stack>
    </Card>
  );
}

export function BenchPanel({ byNode, articles, activities, connected }: BenchPanelProps) {
  const [rocm, setRocm] = useState<RocmInfo | null>(null);

  useEffect(() => {
    fetch("/api/rocm-info")
      .then(r => r.json())
      .then(setRocm)
      .catch(() => setRocm(null));
  }, []);

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

      <SimpleGrid cols={2}>
        <GpuStatusCard rocm={rocm} />

        <Card shadow="xs" withBorder radius="md">
          <Group gap="sm" mb="sm">
            <Badge color={connected ? "green" : "red"} variant="dot">
              WebSocket {connected ? "connected" : "disconnected"}
            </Badge>
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
      </SimpleGrid>

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
        <Stack gap="sm">
          <Text fw={700} size="sm">Node Performance</Text>
          {nodes.map(node => (
            <NodeMetricsCard key={node} node={node} samples={byNode[node]} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
