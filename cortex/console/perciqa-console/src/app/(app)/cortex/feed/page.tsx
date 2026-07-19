"use client";

import { useRouter } from "next/navigation";
import { useCortexEvents } from "@/hooks/useCortexEvents";
import { ArticleCard } from "@/components/cortex/ArticleCard";

export default function ArticleFeedPage() {
  const router = useRouter();
  const { articles, connected } = useCortexEvents();

  return (
    <>
      <div className="page-head">
        <div className="page-head-left">
          <h1>Article Feed</h1>
          <ul className="breadcrumb">
            <li><span style={{ color: "var(--dark-grey)" }}>Cortex</span></li>
            <li className="breadcrumb-sep">›</li>
            <li><span className="breadcrumb-active">Article Feed</span></li>
          </ul>
        </div>
        <span className={`live-badge ${connected ? "connected" : "disconnected"}`}>
          <span className="live-dot" />
          {connected ? "Live" : "Reconnecting…"}
        </span>
      </div>

      <div className="panel-block">
        <div className="panel-block-head">
          <h3>Articles</h3>
        </div>
        {articles.length === 0 ? (
          <div className="ov-empty">
            <p>No articles yet</p>
            <span>Waiting for Cortex broker to publish articles…</span>
          </div>
        ) : (
          <div className="feed-list">
            <div className="feed-header" style={{ gridTemplateColumns: "1fr" }}>
              <span>Articles ({articles.length})</span>
            </div>
            {articles.map((a) => (
              <ArticleCard
                key={a.id}
                article={a}
                onSelect={(id) => router.push(`/cortex/feed/${id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
