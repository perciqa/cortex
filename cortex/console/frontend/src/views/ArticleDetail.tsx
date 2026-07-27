import { useState, useEffect, ReactNode } from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import Shield from "@mui/icons-material/Shield";
import { TrustRing } from "../components/TrustRing";
import { Info } from "../components/Info";

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

const IOC_RE = /\b(?:[0-9a-f]{32,64}|CVE-\d{4}-\d{4,}|T\d{4}(?:\.\d{3})?|\d{1,3}(?:\.\d{1,3}){3})\b/gi;

function CopyChip({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Tooltip title={copied ? "copied" : "click to copy"} arrow>
      <Typography
        component="span"
        onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        sx={{
          fontFamily: '"IBM Plex Mono", monospace', fontSize: "0.6875rem", color: "#c2cbda",
          px: 0.75, py: 0.25, borderRadius: "var(--r-sm, 6px)",
          border: "1px solid rgba(150,170,200,.16)",
          bgcolor: "rgba(255,255,255,.02)",
          textDecoration: "underline dotted rgba(150,170,200,.3)",
          textUnderlineOffset: 3,
          cursor: "copy", display: "inline-block",
          transition: "all 0.14s cubic-bezier(.22,.61,.36,1)",
          "&:hover": { borderColor: "rgba(150,170,200,.3)", color: "#eef2f8" },
        }}
      >
        {label || text}
      </Typography>
    </Tooltip>
  );
}

function Md({ src }: { src: string }) {
  const parts: ReactNode[] = [];
  const segments = src.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  segments.forEach((seg, i) => {
    if (seg.startsWith("**") && seg.endsWith("**")) {
      parts.push(<strong key={i} style={{ color: "#eef2f8", fontWeight: 600 }}>{seg.slice(2, -2)}</strong>);
    } else if (seg.startsWith("`") && seg.endsWith("`")) {
      const inner = seg.slice(1, -1);
      if (IOC_RE.test(inner)) {
        parts.push(<CopyChip key={i} text={inner} label={inner.length > 16 ? `${inner.slice(0, 8)}…${inner.slice(-4)}` : inner} />);
      } else {
        parts.push(<code key={i} style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "0.75rem", color: "#c2cbda", background: "rgba(150,170,200,.08)", padding: "1px 4px", borderRadius: 4 }}>{inner}</code>);
      }
    } else {
      const spans: ReactNode[] = [];
      let last = 0;
      IOC_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = IOC_RE.exec(seg)) !== null) {
        if (m.index > last) spans.push(<span key={`${i}-${last}`}>{seg.slice(last, m.index)}</span>);
        spans.push(<CopyChip key={`${i}-${m.index}`} text={m[0]} label={m[0].length > 12 ? `${m[0].slice(0, 8)}…` : m[0]} />);
        last = m.index + m[0].length;
      }
      if (last < seg.length) spans.push(<span key={`${i}-${last}`}>{seg.slice(last)}</span>);
      parts.push(...spans);
    }
  });
  return <>{parts}</>;
}

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
  const isUnranked = article.trust_score === null || article.trust_score === undefined || article.trust_score === 0;
  const sourceIds = (article.payload as Record<string, unknown>)?.source_article_ids as string[] | undefined;
  const rawPayload = JSON.stringify(article.payload, null, 2);

  return (
    <Card sx={{ borderRadius: "var(--r-md, 10px)" }}>
      <CardContent sx={{ p: "16px 20px !important", "&:last-child": { pb: "16px !important" } }}>
        <Stack direction="row" spacing={2} alignItems="flex-start" sx={{ mb: 2 }}>
          <Box sx={{ textAlign: "center" }}>
            <TrustRing pct={article.trust_score ?? 0} />
            <Box sx={{ mt: 0.5, display: "flex", alignItems: "center", gap: 0.25, justifyContent: "center" }}>
              {isUnranked ? (
                <>
                  <Typography sx={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "0.59375rem", color: "#8a94a8", borderBottom: "1px dashed rgba(150,170,200,.3)" }}>
                    unranked
                  </Typography>
                  <Info k="unranked" />
                </>
              ) : (
                <>
                  <Typography sx={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "0.59375rem", color: "#8a94a8" }}>
                    trust
                  </Typography>
                  <Info k="trust" />
                </>
              )}
            </Box>
          </Box>
          <Box sx={{ flex: 1 }}>
            <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: "wrap", alignItems: "center" }}>
              <Chip label={article.type} color={TYPE_COLORS[article.type] as any || "default"} size="small" />
              <Info k={article.type as any} />
              {orgLabel && <Chip label={orgLabel} color={orgColor as any} variant="outlined" size="small" />}
            </Stack>
            <Typography variant="h6" sx={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.3, mb: 0.5 }}>
              <Md src={article.content} />
            </Typography>
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", alignItems: "center" }}>
              {article.agent_signature && (
                <Chip label={`agent: ${article.agent_signature.slice(0, 10)}…`} size="small" variant="outlined" sx={{ borderColor: "rgba(150,170,200,.16)", color: "#8a94a8", fontFamily: '"IBM Plex Mono", monospace', fontSize: "0.625rem", height: 22 }} />
              )}
              {article.org_signature && (
                <Chip label={`org: ${article.org_signature.slice(0, 10)}…`} size="small" variant="outlined" sx={{ borderColor: "rgba(150,170,200,.16)", color: "#8a94a8", fontFamily: '"IBM Plex Mono", monospace', fontSize: "0.625rem", height: 22 }} />
              )}
              {(article.payload as Record<string, unknown>)?.computation_ref != null && (
                <Chip icon={<Shield sx={{ fontSize: 12 }} />} label="ZK-Verified" color="success" variant="outlined" size="small" />
              )}
            </Stack>
          </Box>
        </Stack>

        <Stack spacing={2}>
          {article.cites && article.cites.length > 0 && (
            <Box>
              <Typography sx={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "0.59375rem", color: "#8a94a8", textTransform: "uppercase", letterSpacing: "0.18em", mb: 0.75 }}>
                Synthesised from {article.cites.length} sources <Info k="payload" />
              </Typography>
              <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap" }}>
                {article.cites.map(cid => (
                  <CopyChip key={cid} text={cid} label={`src · ${cid.slice(0, 8)}…${cid.slice(-4)}`} />
                ))}
              </Stack>
              <Box
                component="details"
                sx={{ mt: 0.75, "& summary": { cursor: "pointer" } }}
              >
                <Box component="summary" sx={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "0.625rem", color: "#8a94a8", cursor: "pointer", "&:hover": { color: "#c2cbda" } }}>
                  view raw tool payload
                </Box>
                <Box component="pre" sx={{ p: 1.5, mt: 0.5, borderRadius: "var(--r-sm, 6px)", bgcolor: "rgba(150,170,200,.04)", border: "1px solid rgba(150,170,200,.08)", overflow: "auto", fontSize: "0.6875rem", fontFamily: '"IBM Plex Mono", monospace', color: "#c2cbda", lineHeight: 1.5 }}>
                  {rawPayload}
                </Box>
              </Box>
            </Box>
          )}

          {article.provenance_children && article.provenance_children.length > 0 && (
            <Box>
              <Typography sx={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "0.59375rem", color: "#8a94a8", textTransform: "uppercase", letterSpacing: "0.18em", mb: 0.75 }}>
                Provenance tree <Info k="provenance" />
              </Typography>
              <Stack spacing={0.5} sx={{ ml: 1 }}>
                {article.provenance_children.map(c => (
                  <Typography key={c.id} variant="body2" sx={{ color: "#8a94a8", fontFamily: '"IBM Plex Mono", monospace', fontSize: "0.75rem" }}>
                    {c.content}
                  </Typography>
                ))}
              </Stack>
            </Box>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
