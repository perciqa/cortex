"use client";

import { useCortexEvents } from "@/hooks/useCortexEvents";
import { ProvenanceGraph } from "@/components/cortex/ProvenanceGraph";
import { PageInfo } from "@/components/PageInfo";

export default function ProvenancePage() {
  const { articles, connected } = useCortexEvents();

  return (
    <>
      <div className="page-head">
        <div className="page-head-left">
          <h1 style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            Provenance Graph
            <PageInfo description="Interactive vis-network graph showing article citation chains and trust relationships." />
          </h1>
          <ul className="breadcrumb">
            <li><span style={{ color: "var(--dark-grey)" }}>Cortex</span></li>
            <li className="breadcrumb-sep">›</li>
            <li><span className="breadcrumb-active">Provenance Graph</span></li>
          </ul>
        </div>
        <span className={`live-badge ${connected ? "connected" : "disconnected"}`}>
          <span className="live-dot" />
          {connected ? "Live" : "Reconnecting…"}
        </span>
      </div>

      <div className="wf-toolbar" style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: "var(--dark-grey)" }}>
          {articles.length} articles in graph
        </span>
      </div>

      {articles.length === 0 ? (
        <div className="provenance-wrap" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="ov-empty">
            <p>No articles to visualize</p>
            <span>Articles with citation links will appear here.</span>
          </div>
        </div>
      ) : (
        <ProvenanceGraph
          articles={articles.map((a) => ({
            id: a.id,
            type: a.type,
            content: a.content,
            trust_score: a.trust_score,
            cites: a.cites,
          }))}
        />
      )}
    </>
  );
}
