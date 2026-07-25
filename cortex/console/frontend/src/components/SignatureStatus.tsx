import { Badge } from "@mantine/core";

export function SignatureStatus({ sig, label }: { sig?: string | null; label: string }) {
  const ok = sig && sig.length > 0;
  return (
    <Badge color={ok ? "green" : "gray"} variant="light" size="sm">
      {ok ? "\u2713" : "\u2022"} {label}
    </Badge>
  );
}
