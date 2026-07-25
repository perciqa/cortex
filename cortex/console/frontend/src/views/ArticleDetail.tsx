import { useState, useEffect } from "react";
import { Card, Badge, Text, Title, Group, Stack, Code } from "@mantine/core";
import { TrustRing } from "../components/TrustRing";
import { SignatureStatus } from "../components/SignatureStatus";

export interface ArticleDetailArticle {
  id: string;
  type: string;
  content: string;
  payload?: Record<string, unknown>;
  trust_score?: number | null;
  cites?: string[];
  agent_signature?: string | null;
  org_signature?: string | null;
  provenance_children?: { id: string; content: string }[];
}

export interface ArticleDetailProps {
  articleId: string;
  article?: ArticleDetailArticle | null;
  fetchArticle: (id: string) => Promise<ArticleDetailArticle>;
}

const TYPE_COLORS: Record<string, string> = {
  finding: "red", insight: "violet", warning: "orange",
  precedent: "blue", procedure: "teal",
};

export function ArticleDetail({ articleId, article: initialArticle, fetchArticle }: ArticleDetailProps) {
  const [article, setArticle] = useState<ArticleDetailArticle | null>(initialArticle || null);
  useEffect(() => {
    if (initialArticle) return;
    let alive = true;
    fetchArticle(articleId).then(a => { if (alive) setArticle(a); });
    return () => { alive = false; };
  }, [articleId, fetchArticle, initialArticle]);
  useEffect(() => {
    if (initialArticle) setArticle(initialArticle);
  }, [initialArticle]);

  if (!article) return <Text c="dimmed">Loading...</Text>;
  if (!article.content || article.content === article.id) return <Text c="dimmed">Loading article data...</Text>;

  return (
    <Card shadow="xs" withBorder radius="md">
      <Group gap="lg" align="flex-start" mb="md">
        <TrustRing pct={article.trust_score ?? 0} />
        <div>
          <Badge color={TYPE_COLORS[article.type] || "gray"} mb="xs">{article.type}</Badge>
          <Title order={4}>{article.content}</Title>
          <Group gap="xs" mt="sm">
            <SignatureStatus sig={article.agent_signature} label="agent" />
            <SignatureStatus sig={article.org_signature} label="org" />
          </Group>
        </div>
      </Group>
      <Stack gap="xs">
        <div>
          <Text fw={600} size="sm">Payload</Text>
          <Code block>{JSON.stringify(article.payload, null, 2)}</Code>
        </div>
        {article.provenance_children && article.provenance_children.length > 0 && (
          <div>
            <Text fw={600} size="sm">Provenance tree</Text>
            <Stack gap={4} ml="md">
              {article.provenance_children.map(c => (
                <Text key={c.id} size="sm" c="dimmed">{c.content}</Text>
              ))}
            </Stack>
          </div>
        )}
      </Stack>
    </Card>
  );
}
