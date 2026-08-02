import { AnimatePresence, motion } from "framer-motion";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { ArticleCard, Article } from "../components/ArticleCard";

export function ArticleFeed({ articles, onSelect }: { articles: Article[]; onSelect?: (id: string) => void }) {
  if (articles.length === 0) {
    return <Typography sx={{ color: "text.secondary", textAlign: "center", py: 4 }}>No articles yet.</Typography>;
  }
  return (
    <Stack spacing={1.5}>
      <AnimatePresence mode="popLayout">
        {articles.map((a, i) => (
          <motion.div
            key={a.id}
            layout
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.3, delay: i * 0.02, ease: "easeOut" }}
          >
            <ArticleCard article={a} onSelect={onSelect} />
          </motion.div>
        ))}
      </AnimatePresence>
    </Stack>
  );
}
