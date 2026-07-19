"use client";

import { useState } from "react";
import { useCortexEvents } from "@/hooks/useCortexEvents";

const SCOPES = ["private", "partner", "public"] as const;
type Scope = typeof SCOPES[number];

export default function ScopeFilterPage() {
  const { articles, connected } = useCortexEvents();
  const [active, setActive] = useState<Set<Scope>>(new Set(["private", "partner", "public"]));

  const toggle = (s: Scope) => {
    const n = new Set(active);
    n.has(s) ? n.delete(s) : n.add(s);
    setActive(n);
  };

  return (
    <>
      <div className="page-head">
        <div className="page-head-left">
          <h1>Scope Filter</h1>
          <ul className="breadcrumb">
            <li><span style={{ color: "var(--dark-grey)" }}>Cortex</span></li>
            <li className="breadcrumb-sep">›</li>
            <li><span className="breadcrumb-active">Scope Filter</span></li>
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

        <div className="wf-toolbar" style={{ marginBottom: 16 }}>
          {SCOPES.map((s) => (
            <button
              key={s}
              onClick={() => toggle(s)}
              className="wf-toolbar-btn"
              style={{
                background: active.has(s) ? "var(--blue)" : "var(--grey)",
                color: active.has(s) ? "var(--light)" : "var(--dark-grey)",
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {articles.length === 0 ? (
          <div className="ov-empty">
            <p>No articles yet</p>
          </div>
        ) : (
          <div className="feed-list">
            <div className="feed-header" style={{ gridTemplateColumns: "1fr 80px 80px" }}>
              <span>Content</span>
              <span>Scope</span>
              <span>Status</span>
            </div>
            {articles.map((a) => {
              const scope = (a.scope ?? "public") as Scope;
              const inScope = active.has(scope);
              return (
                <div
                  key={a.id}
                  className="feed-row"
                  style={{
                    gridTemplateColumns: "1fr 80px 80px",
                    opacity: inScope ? 1 : 0.35,
                  }}
                >
                  <span className="feed-agent" style={{ fontSize: 12 }}>
                    {a.content.slice(0, 100)}
                  </span>
                  <span className="status-badge" style={{ background: "var(--grey)", color: "var(--dark-grey)" }}>
                    {scope}
                  </span>
                  <span
                    className="live-badge"
                    style={{
                      background: inScope ? "var(--light-green)" : "var(--grey)",
                      color: inScope ? "var(--green)" : "var(--dark-grey)",
                    }}
                  >
                    {inScope ? "visible" : "dimmed"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
