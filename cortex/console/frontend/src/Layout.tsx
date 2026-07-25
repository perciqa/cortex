import { AppShell, Group, NavLink, Title, Text } from "@mantine/core";
import { IconLayoutDashboard, IconList, IconGraph, IconFilter, IconChartBar, IconShield, IconRobot } from "@tabler/icons-react";
import { StatusPill } from "./components/StatusPill";

export type ViewId = "overview" | "feed" | "detail" | "provenance" | "scope" | "bench" | "attack" | "activity";

export interface LayoutProps {
  current: ViewId;
  onNavigate: (v: ViewId) => void;
  connected: boolean;
  children: React.ReactNode;
}

const NAV_ITEMS: { id: ViewId; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Fabric Overview", icon: <IconLayoutDashboard size={18} /> },
  { id: "feed", label: "Article Feed", icon: <IconList size={18} /> },
  { id: "activity", label: "Agent Activity", icon: <IconRobot size={18} /> },
  { id: "provenance", label: "Provenance Graph", icon: <IconGraph size={18} /> },
  { id: "scope", label: "Scope Filter", icon: <IconFilter size={18} /> },
  { id: "bench", label: "Bench Panel", icon: <IconChartBar size={18} /> },
  { id: "attack", label: "Attack Matrix", icon: <IconShield size={18} /> },
];

export function Layout({ current, onNavigate, connected, children }: LayoutProps) {
  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 240, breakpoint: 0 }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Title order={4}>Perciqa Cortex</Title>
          </Group>
          <StatusPill connected={connected} />
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="xs">
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.id}
            label={item.label}
            leftSection={item.icon}
            active={current === item.id}
            onClick={() => onNavigate(item.id)}
            variant="filled"
            color="blue"
          />
        ))}
      </AppShell.Navbar>
      <AppShell.Main>
        {children}
      </AppShell.Main>
    </AppShell>
  );
}
