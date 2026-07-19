"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useCortexMetrics } from "@/hooks/useCortexMetrics";

export default function BenchPanelPage() {
  const { byNode, connected } = useCortexMetrics();
  const flat = Object.values(byNode).flat();
  const embedData = flat.map(s => ({ name: s.node, radeon: s.embeds_per_sec_radeon, cpu: s.embeds_per_sec_cpu }));
  const queryData = flat.map(s => ({ name: s.node, radeon: s.queries_per_sec_radeon, cpu: s.queries_per_sec_cpu }));

  return (
    <>
      <div className="page-head">
        <div className="page-head-left">
          <h1>Bench Panel</h1>
          <ul className="breadcrumb">
            <li><span style={{ color: "var(--dark-grey)" }}>Cortex</span></li>
            <li className="breadcrumb-sep">›</li>
            <li><span className="breadcrumb-active">Bench Panel</span></li>
          </ul>
        </div>
        <span className={`live-badge ${connected ? "connected" : "disconnected"}`}>
          <span className="live-dot" />
          {connected ? "Live" : "Reconnecting…"}
        </span>
      </div>

      <div className="box-info" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="panel-block">
          <div className="panel-block-head">
            <h3>Embeds/sec</h3>
          </div>
          {embedData.length === 0 ? (
            <div className="ov-empty"><p>No data yet</p></div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={embedData} layout="vertical">
                <XAxis type="number" stroke="#94a3b8" />
                <YAxis type="category" dataKey="name" stroke="#94a3b8" />
                <Tooltip />
                <Bar dataKey="radeon" fill="var(--red)" />
                <Bar dataKey="cpu" fill="var(--blue)" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="panel-block">
          <div className="panel-block-head">
            <h3>Queries/sec</h3>
          </div>
          {queryData.length === 0 ? (
            <div className="ov-empty"><p>No data yet</p></div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={queryData} layout="vertical">
                <XAxis type="number" stroke="#94a3b8" />
                <YAxis type="category" dataKey="name" stroke="#94a3b8" />
                <Tooltip />
                <Bar dataKey="radeon" fill="var(--red)" />
                <Bar dataKey="cpu" fill="var(--blue)" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </>
  );
}
