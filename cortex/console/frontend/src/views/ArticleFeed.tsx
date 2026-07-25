import { Stack } from "@mantine/core";
import { ArticleCard, Article } from "../components/ArticleCard";

export interface ArticleFeedProps { articles: Article[]; onSelect?: (id: string) => void; }

export function ArticleFeed({ articles, onSelect }: ArticleFeedProps) {
  return (
    <Stack gap="sm">
      {articles.map(a => (
        <ArticleCard key={a.id} article={a} onSelect={onSelect} />
      ))}
    </Stack>
  );
}
