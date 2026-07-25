import { Badge } from "@mantine/core";

export function StatusPill({ connected }: { connected: boolean }) {
  return (
    <Badge color={connected ? "green" : "red"} variant="dot" size="lg">
      {connected ? "connected" : "disconnected"}
    </Badge>
  );
}
