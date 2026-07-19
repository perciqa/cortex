"use client";

import { TrustRing } from "./TrustRing";

const TYPE_ICON: Record<string, string> = {
  finding: "F",
  insight: "I",
  warning: "W",
  precedent: "P",
  procedure: "R",
};

function colorForType(type: string): string {
  const map: Record<string, string> = {
    finding: "red",
    insight: "blue",
    warning: "yellow",
    precedent: "violet",
    procedure: "green",
  };
  return map[type] ?? "blue";
}

export interface Article {
  id: string;
  type: string;
  content: string;
  trust_score?: number | null;
}

export interface ArticleCardProps { article: Article; onSelect?: (id: string) => void; }

export function ArticleCard({ article, onSelect }: ArticleCardProps) {
  return (
    <div className="box-info-item" style={{ cursor: onSelect ? "pointer" : undefined }}>
      <div className={`box-info-icon ${colorForType(article.type)}`}>
        {TYPE_ICON[article.type] ?? "?"}
      </div>
      <div className="box-info-text" style={{ flex: 1 }}>
        <p className="evals-stat-label">{article.type}</p>
        <h3 style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.4 }}>
          {article.content.slice(0, 180)}
        </h3>
      </div>
      <TrustRing pct={article.trust_score ?? 0} />
      {onSelect && (
        <button
          onClick={() => onSelect(article.id)}
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--blue)",
            background: "none",
            border: "none",
            cursor: "pointer",
            textDecoration: "underline",
            whiteSpace: "nowrap",
          }}
        >
          detail
        </button>
      )}
    </div>
  );
}
