import { useState, useEffect } from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import Shield from "@mui/icons-material/Shield";
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
  src_org?: string;
  provenance_children?: { id: string; content: string }[];
}

export interface ArticleDetailProps {
  articleId: string;
  article?: ArticleDetailArticle | null;
  fetchArticle: (id: string) => Promise<ArticleDetailArticle>;
  onNavigate?: (path: string) => void;
}

const TYPE_COLORS: Record<string, string> = {
  finding: "error", insight: "secondary", warning: "warning",
  precedent: "info", procedure: "success",
};

const ORG_LABELS: Record<string, string> = {
  "did:percq:org:soc-alpha": "SOC Alpha",
  "did:percq:org:soc-beta": "SOC Beta",
};

const ORG_COLORS: Record<string, string> = {
  "did:percq:org:soc-alpha": "primary",
  "did:percq:org:soc-beta": "warning",
};

export function ArticleDetail({ articleId, article: initialArticle, fetchArticle, onNavigate }: ArticleDetailProps) {
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

  if (!article) return <Typography sx={{ color: "text.secondary" }}>Loading...</Typography>;
  if (!article.content || article.content === article.id) return <Typography sx={{ color: "text.secondary" }}>Loading article data...</Typography>;

  const orgLabel = ORG_LABELS[article.src_org || ""] || "";
  const orgColor = ORG_COLORS[article.src_org || ""] || "default";

  return (
    <Card>
      <CardContent>
        <Stack direction="row" spacing={2} alignItems="flex-start" sx={{ mb: 2 }}>
          <TrustRing pct={article.trust_score ?? 0} />
          <div style={{ flex: 1 }}>
            <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: "wrap" }}>
              <Chip label={article.type} color={TYPE_COLORS[article.type] as any || "default"} size="small" />
              {orgLabel && <Chip label={orgLabel} color={orgColor as any} variant="outlined" size="small" />}
            </Stack>
            <Typography variant="h6">{article.content}</Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <SignatureStatus sig={article.agent_signature} label="agent" />
              <SignatureStatus sig={article.org_signature} label="org" />
              {(article.payload as Record<string, unknown>)?.computation_ref != null && (
                <Chip
                  icon={<Shield />}
                  label="ZK-Verified"
                  color="success"
                  variant="outlined"
                  size="small"
                />
              )}
            </Stack>
          </div>
        </Stack>
        <Stack spacing={2}>
          {article.cites && article.cites.length > 0 && (
            <div>
              <Typography sx={{ fontWeight: 600, fontSize: "0.875rem", mb: 0.5 }}>
                Cites ({article.cites.length})
              </Typography>
              <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap" }}>
                {article.cites.map(cid => (
                  <Chip
                    key={cid}
                    label={`${cid.slice(0, 12)}…`}
                    variant="outlined"
                    size="small"
                    sx={{ cursor: "pointer" }}
                    onClick={() => onNavigate?.(`/article/${cid}`)}
                  />
                ))}
              </Stack>
            </div>
          )}
          <div>
            <Typography sx={{ fontWeight: 600, fontSize: "0.875rem" }}>Payload</Typography>
            <Paper variant="outlined" component="pre" sx={{ p: 1, overflow: "auto", fontSize: "0.75rem", fontFamily: "monospace" }}>
              {JSON.stringify(article.payload, null, 2)}
            </Paper>
          </div>
          {article.provenance_children && article.provenance_children.length > 0 && (
            <div>
              <Typography sx={{ fontWeight: 600, fontSize: "0.875rem" }}>Provenance tree</Typography>
              <Stack spacing={0.5} sx={{ ml: 2 }}>
                {article.provenance_children.map(c => (
                  <Typography key={c.id} variant="body2" sx={{ color: "text.secondary" }}>{c.content}</Typography>
                ))}
              </Stack>
            </div>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
