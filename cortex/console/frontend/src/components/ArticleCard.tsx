import { Card, Group, Badge, Text, Button, Anchor } from "@mantine/core";
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
  src_org?: string;
}

const TYPE_COLORS: Record<string, string> = {
  finding: "red",
  insight: "violet",
  warning: "orange",
  precedent: "blue",
  procedure: "teal",
};

const ORG_LABELS: Record<string, string> = {
  "did:percq:org:soc-alpha": "SOC Alpha",
  "did:percq:org:soc-beta": "SOC Beta",
};

const ORG_COLORS: Record<string, string> = {
  "did:percq:org:soc-alpha": "blue",
  "did:percq:org:soc-beta": "orange",
};

export function ArticleCard({ article, onSelect }: { article: Article; onSelect?: (id: string) => void }) {
  const orgLabel = ORG_LABELS[article.src_org || ""] || "";
  const orgColor = ORG_COLORS[article.src_org || ""] || "gray";
  const tactic = article.payload?.tactic as string | undefined;
  const technique = article.payload?.technique_id as string | undefined;
  const threatActor = article.payload?.threat_actor as string | undefined;

  const isLlmDerived = (article.type === "insight" || article.type === "warning")
    && article.cites != null && article.cites.length > 0;

  return (
    <Card shadow="xs" withBorder radius="md" p="sm">
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <TrustRing pct={article.trust_score ?? 0} />
        <div style={{ flex: 1 }}>
          <Group gap="xs" mb={4} wrap="wrap">
            <Badge color={TYPE_COLORS[article.type] || "gray"} size="sm">{article.type}</Badge>
            {orgLabel && <Badge color={orgColor} variant="light" size="sm">{orgLabel}</Badge>}
            {technique && <Badge variant="outline" size="sm">{technique}</Badge>}
            {tactic && <Badge variant="dot" size="sm" c="dimmed">{tactic}</Badge>}
            {isLlmDerived && (
              <Badge color="violet" variant="light" size="sm">⚡ LLM-synthesized</Badge>
            )}
            <SignatureStatus sig={article.agent_signature} label="agent" />
            <SignatureStatus sig={article.org_signature} label="org" />
          </Group>
          {threatActor && (
            <Text size="xs" c="dimmed" mb={2}>Actor: {threatActor}</Text>
          )}
          <Text size="sm" lineClamp={2}>{article.content}</Text>
          {article.cites && article.cites.length > 0 && (
            <Text size="xs" c="dimmed" mt={4}>
              Cites {article.cites.length} article{article.cites.length > 1 ? "s" : ""}
            </Text>
          )}
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
