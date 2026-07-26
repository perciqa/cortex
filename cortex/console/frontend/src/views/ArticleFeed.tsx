import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { ArticleCard, Article } from "../components/ArticleCard";

export function ArticleFeed({ articles, onSelect }: { articles: Article[]; onSelect?: (id: string) => void }) {
  if (articles.length === 0) {
    return <Typography sx={{ color: "text.secondary", textAlign: "center", py: 4 }}>No articles yet.</Typography>;
  }
  return (
    <Stack spacing={1.5}>
      {articles.map(a => (
        <ArticleCard key={a.id} article={a} onSelect={onSelect} />
      ))}
    </Stack>
  );
}
