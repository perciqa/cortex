"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { TrustRing } from "@/components/cortex/TrustRing";
import { SignatureStatus } from "@/components/cortex/SignatureStatus";
import { useCortexEvents } from "@/hooks/useCortexEvents";
import type { Article } from "@/state/cortexStore";

const TYPE_COLORS: Record<string, string> = {
  finding: "var(--light-red) var(--red)",
  insight: "var(--light-blue) var(--blue)",
  warning: "var(--light-yellow) var(--yellow)",
  precedent: "var(--light-violet) var(--violet)",
  procedure: "var(--light-green) var(--green)",
};

export default function ArticleDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { articles } = useCortexEvents();
  const [article, setArticle] = useState<Article | null>(null);

  useEffect(() => {
    const found = articles.find((a) => a.id === id);
    if (found) {
      setArticle(found);
      return;
    }
    fetch(`/cortex-api/articles/${id}`)
      .then((r) => r.json())
      .then(setArticle)
      .catch(() => {});
  }, [id, articles]);

  if (!article) {
    return (
      <div className="overview-loading">
        <div className="overview-loading-ring" />
        <span>Loading article…</span>
      </div>
    );
  }

  const [bg, color] = (TYPE_COLORS[article.type] ?? "var(--grey) var(--dark-grey)").split(" ");

  return (
    <>
      <div className="page-head">
        <div className="page-head-left">
          <h1>{article.id.slice(0, 8)}</h1>
          <ul className="breadcrumb">
            <li>
              <Link href="/cortex/feed" style={{ color: "var(--dark-grey)", textDecoration: "none" }}>
                Article Feed
              </Link>
            </li>
            <li className="breadcrumb-sep">›</li>
            <li><span className="breadcrumb-active">{article.id.slice(0, 8)}</span></li>
          </ul>
        </div>
        <Link
          href="/cortex/feed"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 12,
            fontWeight: 600,
            color: "var(--blue)",
            textDecoration: "none",
          }}
        >
          ← Back
        </Link>
      </div>

      <div className="table-data">
        <div className="panel-block" style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
            <TrustRing pct={article.trust_score ?? 0} />
            <div>
              <span
                className="status-badge"
                style={{ background: bg, color, marginBottom: 8, display: "inline-block" }}
              >
                {article.type}
              </span>
              <div style={{ fontSize: 14, lineHeight: 1.6, color: "var(--dark)", marginTop: 8 }}>
                {article.content}
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
                <SignatureStatus sig={article.agent_signature} label="agent" />
                <SignatureStatus sig={article.org_signature} label="org" />
              </div>
            </div>
          </div>
        </div>

        <div className="panel-block" style={{ flex: 1 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Payload</h3>
          <pre
            style={{
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              background: "var(--grey)",
              borderRadius: 8,
              padding: "12px 16px",
              overflow: "auto",
              maxHeight: 400,
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              margin: 0,
            }}
          >
            {JSON.stringify(article.payload ?? {}, null, 2)}
          </pre>
        </div>
      </div>
    </>
  );
}
