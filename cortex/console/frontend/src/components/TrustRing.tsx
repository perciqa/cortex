import { RingProgress, Text } from "@mantine/core";

export function TrustRing({ pct }: { pct: number }) {
  const color = pct > 0.7 ? "green" : pct > 0.4 ? "yellow" : "red";
  return (
    <RingProgress
      size={48}
      thickness={4}
      sections={[{ value: Math.round(pct * 100), color }]}
      label={<Text c={color} ta="center" size="xs">{Math.round(pct * 100)}</Text>}
    />
  );
}
