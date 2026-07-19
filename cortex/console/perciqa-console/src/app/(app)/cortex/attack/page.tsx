"use client";

import { useState } from "react";
import { useCortexEvents } from "@/hooks/useCortexEvents";

const ATTACK_TECHNIQUES = [
  "T1","T2","T3","T4","T5","T6","T7","T8","T9","T10",
  "T11","T12","T13","T14","T15",
];

export default function AttackMatrixPage() {
  const { articles, connected } = useCortexEvents();
  const [selected, setSelected] = useState<string | null>(null);

  const counts: Record<string, number> = {};
  articles.forEach((a) => {
    const matches = a.content.match(/T\d+/g);
    if (matches) matches.forEach((tid) => { counts[tid] = (counts[tid] ?? 0) + 1; });
  });

  const articlesFor = (tid: string) =>
    articles.filter((a) => a.content.includes(tid));

  return (
    <>
      <div className="page-head">
        <div className="page-head-left">
          <h1>Attack Matrix</h1>
          <ul className="breadcrumb">
            <li><span style={{ color: "var(--dark-grey)" }}>Cortex</span></li>
            <li className="breadcrumb-sep">›</li>
            <li><span className="breadcrumb-active">Attack Matrix</span></li>
          </ul>
        </div>
        <span className={`live-badge ${connected ? "connected" : "disconnected"}`}>
          <span className="live-dot" />
          {connected ? "Live" : "Reconnecting…"}
        </span>
      </div>

      <div className="panel-block">
        <div className="panel-block-head">
          <h3>MITRE ATT&CK Heatmap</h3>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(15, 1fr)", gap: 4 }}>
          {ATTACK_TECHNIQUES.map((tid) => {
            const n = counts[tid] ?? 0;
            const level = n >= 3 ? "high" : n >= 1 ? "low" : "none";
            return (
              <button
                key={tid}
                className={`attack-cell ${level}`}
                onClick={() => setSelected(selected === tid ? null : tid)}
                style={{
                  border: selected === tid ? "2px solid var(--blue)" : undefined,
                }}
              >
                {tid}
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <div className="panel-block" style={{ marginTop: 16 }}>
          <div className="panel-block-head">
            <h3>Findings for {selected}</h3>
          </div>
          {articlesFor(selected).length === 0 ? (
            <div className="ov-empty"><p>No matching articles</p></div>
          ) : (
            <div className="feed-list">
              {articlesFor(selected).map((a) => (
                <div key={a.id} className="feed-row" style={{ gridTemplateColumns: "1fr" }}>
                  <div className="feed-agent" style={{ fontSize: 12 }}>{a.content.slice(0, 180)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
