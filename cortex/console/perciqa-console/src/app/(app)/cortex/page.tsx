"use client";

import { useCortexEvents } from "@/hooks/useCortexEvents";
import { PageInfo } from "@/components/PageInfo";

export default function FabricOverviewPage() {
  const { articles, connected } = useCortexEvents();
  const tenants = [
    { slug: "soc-alpha", org_did: "did:web:soc-alpha.perciqa.ai" },
    { slug: "soc-beta", org_did: "did:web:soc-beta.perciqa.ai" },
  ];

  const lastRoute = articles.length > 0 ? articles[0] : null;

  return (
    <>
      <div className="page-head">
        <div className="page-head-left">
          <h1 style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            Fabric Overview
            <PageInfo description="Live view of Cortex fabric tenants and event flow between nodes." />
          </h1>
          <ul className="breadcrumb">
            <li><span style={{ color: "var(--dark-grey)" }}>Cortex</span></li>
            <li className="breadcrumb-sep">›</li>
            <li><span className="breadcrumb-active">Fabric Overview</span></li>
          </ul>
        </div>
        <span className={`live-badge ${connected ? "connected" : "disconnected"}`}>
          <span className="live-dot" />
          {connected ? "Live" : "Reconnecting…"}
        </span>
      </div>

      <div className="box-info" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 24, position: "relative" }}>
        {tenants.map((t) => (
          <div key={t.slug} className="box-info-item" style={{ flexDirection: "column", gap: 8 }}>
            <div className={`box-info-icon ${t.slug === "soc-alpha" ? "blue" : "green"}`}>
              {t.slug === "soc-alpha" ? "α" : "β"}
            </div>
            <div className="box-info-text">
              <h3 style={{ fontSize: 18 }}>{t.slug}</h3>
              <p className="sub">{t.org_did}</p>
            </div>
          </div>
        ))}
        {lastRoute && (
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              fontSize: 24,
              color: "var(--blue)",
              opacity: connected ? 1 : 0.2,
              animation: connected ? "pulse-live 2s infinite" : undefined,
            }}
          >
            ⟿
          </div>
        )}
      </div>

      <div className="panel-block">
        <div className="panel-block-head">
          <h3>Live Events</h3>
        </div>
        <div className="feed-list">
          {articles.length === 0 ? (
            <div className="ov-empty">
              <p>No events yet</p>
              <span>Waiting for Cortex broker events…</span>
            </div>
          ) : (
            articles.slice(0, 20).map((a) => (
              <div key={a.id} className="feed-row" style={{ gridTemplateColumns: "1fr" }}>
                <div className="feed-agent">{a.type}: {a.content.slice(0, 120)}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
