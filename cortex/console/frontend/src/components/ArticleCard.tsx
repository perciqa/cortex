import { Card, Group, Badge, Text, Button } from "@mantine/core";
import { TrustRing } from "./TrustRing";
import { SignatureStatus } from "./SignatureStatus";

export interface Article {
  id: string;
  type: string;
  content: string;
  payload?: Record<string, unknown>;
  trust_score?: number | null;
  agent_signature?: string | null;
  org_signature?: string | null;
  cites?: string[];
}

const TYPE_COLORS: Record<string, string> = {
  finding: "red",
  insight: "violet",
  warning: "orange",
  precedent: "blue",
  procedure: "teal",
};

export function ArticleCard({ article, onSelect }: { article: Article; onSelect?: (id: string) => void }) {
  return (
    <Card shadow="xs" withBorder radius="md" p="sm">
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <TrustRing pct={article.trust_score ?? 0} />
        <div style={{ flex: 1 }}>
          <Group gap="xs" mb={4}>
            <Badge color={TYPE_COLORS[article.type] || "gray"} size="sm">{article.type}</Badge>
            <SignatureStatus sig={article.agent_signature} label="agent" />
            <SignatureStatus sig={article.org_signature} label="org" />
          </Group>
          <Text size="sm" lineClamp={2}>{article.content}</Text>
        </div>
        {onSelect && (
          <Button variant="subtle" size="compact-sm" onClick={() => onSelect(article.id)}>
            detail
          </Button>
        )}
      </Group>
    </Card>
  );
}
