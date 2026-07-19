"use client";

import { useCallback, useEffect, useState } from "react";
import { Drawer, Group, Loader, Table, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconCoin, IconBolt, IconShieldCheck, IconUsers, IconTimeline,
} from "@tabler/icons-react";
import { listTraces, getTrace, type TraceSummary, type TraceDetail, type SpanRow } from "@/lib/api";
import { fmtMs, fmtTokens, fmtCost, timeAgo } from "@/lib/format";
import { useArgusWebSocket } from "@/hooks/useArgusWebSocket";
import type { WsEvent } from "@/hooks/useArgusWebSocket";

const STATUS_BG: Record<string, string> = {
  ok: "var(--blue)", error: "var(--red)", drift: "var(--orange)", timeout: "var(--dark-grey)",
};
const STATUS_LABEL: Record<string, string> = {
  ok: "pass", error: "fail", drift: "drift", timeout: "timeout",
};

function SpanTimeline({ spans }: { spans: SpanRow[] }) {
  const sorted = [...spans].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );

  const depthMap: Record<string, number> = {};
  sorted.forEach((s) => {
    depthMap[s.span_id] = s.parent_span_id ? (depthMap[s.parent_span_id] ?? 0) + 1 : 0;
  });

  const maxMs = Math.max(...sorted.map((s) => s.duration_ms ?? 0), 1);

  const KIND: Record<string, string> = {
    agent: "agent", model_call: "model_call", tool_call: "tool_call",
    internal: "internal", guardrail: "guardrail",
  };

  return (
    <div className="span-timeline">
      {sorted.map((span) => {
        const depth = depthMap[span.span_id] ?? 0;
        const cls   = KIND[span.kind] ?? "internal";
        const pct   = Math.max(4, ((span.duration_ms ?? 0) / maxMs) * 100);

        return (
          <div key={span.span_id} className="span-timeline-row" style={{ paddingLeft: depth * 16 }}>
            <div className="span-timeline-header">
              <div className={`span-kind-dot ${cls}`} />
              <span className="span-timeline-name">{span.name}</span>
              <span className="span-timeline-duration">{fmtMs(span.duration_ms)}</span>
            </div>
            <div className="span-duration-bar-wrap">
              <div className={`span-duration-bar ${cls}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="span-timeline-meta">
              <span>{span.kind.replace("_", " ")}</span>
              {span.model_name && <span>{span.model_name}</span>}
              {span.tool_name && <span>{span.tool_name}</span>}
              {span.completion_tokens != null && <span>{span.completion_tokens} tok</span>}
              {span.model_cost_usd != null && span.model_cost_usd > 0 && <span>{fmtCost(span.model_cost_usd)}</span>}
              {span.error_message && <span style={{ color: "var(--red)" }}>{span.error_message}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function TracesPage() {
  const [traces, setTraces]               = useState<TraceSummary[]>([]);
  const [total, setTotal]                 = useState(0);
  const [loading, setLoading]             = useState(true);
  const [selected, setSelected]           = useState<TraceDetail | null>(null);
  const [drawerOpen, setDrawerOpen]       = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    listTraces({ limit: 50 })
      .then((d) => { setTraces(d.traces); setTotal(d.total); })
      .catch(() => { })
      .finally(() => setLoading(false));
  }, []);

  const { status } = useArgusWebSocket(
    useCallback((event: WsEvent) => {
      if (event.event === "new_trace") {
        const t = event.data as unknown as TraceSummary;
        setNewIds((prev) => new Set([...prev, t.trace_id]));
        setTraces((prev) => [t, ...prev.slice(0, 49)]);
        setTotal((n) => n + 1);
        notifications.show({ title: "New trace", message: `${t.agent_name}${t.task ? ` · ${t.task}` : ""}`, color: "blue", autoClose: 3000 });
        setTimeout(() => { setNewIds((prev) => { const n = new Set(prev); n.delete(t.trace_id); return n; }); }, 2000);
      }
      if (event.event === "eval_complete") {
        const d = event.data as { overall_score?: number; verdict?: string };
        notifications.show({ title: "Eval complete", message: `Score ${d.overall_score?.toFixed(1) ?? "—"} · ${d.verdict ?? ""}`, color: "teal", autoClose: 4000 });
      }
    }, [])
  );

  const openTrace = async (id: string) => {
    setDrawerOpen(true);
    setLoadingDetail(true);
    try { setSelected(await getTrace(id)); }
    finally { setLoadingDetail(false); }
  };

  const todayCost   = traces.reduce((s, t) => s + t.total_cost_usd, 0);
  const localTokens = traces.reduce((s, t) => s + t.local_tokens, 0);
  const passCount   = traces.filter((t) => t.status === "ok").length;
  const passRate    = traces.length ? Math.round((passCount / traces.length) * 100) : 0;
  const agentCount  = new Set(traces.map((t) => t.agent_name)).size;

  return (
    <>
      <div className="page-head">
        <div className="page-head-left">
          <h1>Traces</h1>
          <ul className="breadcrumb">
            <li><span style={{ color: "var(--dark-grey)" }}>Argus</span></li>
            <li className="breadcrumb-sep">›</li>
            <li><span className="breadcrumb-active">Traces</span></li>
          </ul>
        </div>
        <span className={`live-badge ${status === "connected" ? "connected" : "disconnected"}`}>
          <span className="live-dot" />
          {status === "connected" ? "Live" : "Reconnecting…"}
        </span>
      </div>

      <ul className="box-info">
        <li className="box-info-item">
          <div className="box-info-icon blue"><IconCoin size={32} stroke={1.6} /></div>
          <div className="box-info-text">
            <h3 className="mono">{fmtCost(todayCost)}</h3>
            <p>Cost Today</p>
          </div>
        </li>
        <li className="box-info-item">
          <div className="box-info-icon green"><IconBolt size={32} stroke={1.6} /></div>
          <div className="box-info-text">
            <h3 className="mono">{fmtTokens(localTokens)}</h3>
            <p>Local Tokens</p>
            <span className="sub">$0.00 (free)</span>
          </div>
        </li>
        <li className="box-info-item">
          <div className="box-info-icon violet"><IconShieldCheck size={32} stroke={1.6} /></div>
          <div className="box-info-text">
            <h3>{passRate}%</h3>
            <p>Pass Rate</p>
            <span className="sub">{passCount}/{traces.length} traces</span>
          </div>
        </li>
        <li className="box-info-item">
          <div className="box-info-icon orange"><IconUsers size={32} stroke={1.6} /></div>
          <div className="box-info-text">
            <h3>{agentCount}</h3>
            <p>Agents</p>
            <span className="sub">{total} total traces</span>
          </div>
        </li>
      </ul>

      <div className="table-data">
        <div className="panel-block" style={{ flexGrow: 1 }}>
          <div className="panel-block-head">
            <h3>Live Traces</h3>
            <IconTimeline size={18} color="var(--dark-grey)" />
          </div>

          {loading ? (
            <div style={{ padding: 48, display: "flex", justifyContent: "center" }}>
              <Loader size="sm" color="blue" />
            </div>
          ) : traces.length === 0 ? (
            <Text size="sm" c="dimmed" ta="center" py={32}>
              No traces yet. Instrument your agent with the Argus SDK.
            </Text>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }} className="trace-table">
              <thead>
                <tr>
                  {["Status", "Agent", "Task", "Duration", "Tokens", "Cost", "Time"].map((h) => (
                    <th key={h} style={{ paddingBottom: 12, fontSize: 11, fontWeight: 700, textAlign: "left", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--dark-grey)", borderBottom: "1px solid var(--grey)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {traces.map((t) => (
                  <tr
                    key={t.trace_id}
                    onClick={() => openTrace(t.trace_id)}
                      style={{
                        cursor: "pointer",
                        background: newIds.has(t.trace_id) ? "var(--light-blue)" : undefined,
                        transition: "background 1.5s ease",
                      }}
                      onMouseEnter={(e) => { if (!newIds.has(t.trace_id)) (e.currentTarget as HTMLElement).style.background = "var(--grey)"; }}
                      onMouseLeave={(e) => { if (!newIds.has(t.trace_id)) (e.currentTarget as HTMLElement).style.background = ""; }}
                  >
                    <td style={{ padding: "14px 8px 14px 0" }}>
                      <span className="status-badge" style={{ background: STATUS_BG[t.status] ?? "var(--dark-grey)" }}>
                        {STATUS_LABEL[t.status] ?? t.status}
                      </span>
                    </td>
                    <td style={{ padding: "14px 8px", fontSize: 13, fontWeight: 600 }}>{t.agent_name}</td>
                    <td style={{ padding: "14px 8px", fontSize: 12, color: "var(--dark-grey)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.task ?? "—"}
                    </td>
                    <td style={{ padding: "14px 8px", fontSize: 12, fontFamily: "var(--font-mono)" }}>{fmtMs(t.duration_ms)}</td>
                    <td style={{ padding: "14px 8px", fontSize: 12, fontFamily: "var(--font-mono)" }}>{fmtTokens(t.total_tokens)}</td>
                    <td style={{ padding: "14px 8px", fontSize: 12, fontFamily: "var(--font-mono)" }}>{fmtCost(t.total_cost_usd)}</td>
                    <td style={{ padding: "14px 0 14px 8px", fontSize: 12, color: "var(--dark-grey)", whiteSpace: "nowrap" }}>{timeAgo(t.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Drawer
        opened={drawerOpen}
        onClose={() => { setDrawerOpen(false); setSelected(null); }}
        title={
          <Group gap="xs">
            <Text fw={700} size="sm" ff="var(--poppins)">Span timeline</Text>
            {selected && (
              <span className="status-badge" style={{ background: STATUS_BG[selected.status] ?? "var(--dark-grey)" }}>
                {STATUS_LABEL[selected.status] ?? selected.status}
              </span>
            )}
          </Group>
        }
        position="right"
        size="lg"
        styles={{
          header: { borderBottom: "1px solid var(--grey)", paddingBottom: 12 },
          body:   { paddingTop: 16, paddingLeft: 20, paddingRight: 20, fontFamily: "var(--poppins)" },
        }}
      >
        {loadingDetail ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
            <Loader size="sm" color="blue" />
          </div>
        ) : selected ? (
          <>
            <div style={{ marginBottom: 20 }}>
              {[
                { label: "Agent",    value: selected.agent_name, mono: false },
                { label: "Task",     value: selected.task ?? "—", mono: false },
                { label: "Duration", value: fmtMs(selected.duration_ms), mono: true },
                { label: "Tokens",   value: selected.total_tokens.toLocaleString(), mono: true },
                { label: "Cost",     value: fmtCost(selected.total_cost_usd) + (selected.total_cost_usd === 0 ? " (local)" : ""), mono: true },
              ].map(({ label, value, mono }) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--grey)" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--dark-grey)" }}>{label}</span>
                  <span style={{ fontSize: 13, fontWeight: 500, fontFamily: mono ? "var(--font-mono)" : undefined }}>{value}</span>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--dark-grey)", marginBottom: 8 }}>
              Spans ({selected.spans.length})
            </div>
            <div style={{ display: "flex", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
              {[
                { cls: "agent",      label: "Agent"    },
                { cls: "model_call", label: "Model"    },
                { cls: "tool_call",  label: "Tool"     },
                { cls: "internal",   label: "Internal" },
              ].map(({ cls, label }) => (
                <div key={cls} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--dark-grey)" }}>
                  <div className={`span-kind-dot ${cls}`} />
                  {label}
                </div>
              ))}
            </div>

            <SpanTimeline spans={selected.spans} />

            <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--grey)", textAlign: "center" }}>
              <a
                href={`/argus/traces/${selected.trace_id}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--blue)",
                  textDecoration: "none",
                  padding: "6px 14px",
                  borderRadius: 8,
                  background: "var(--light-blue)",
                  transition: "background 0.15s",
                }}
              >
                <IconTimeline size={16} /> View full trace
              </a>
            </div>
          </>
        ) : null}
      </Drawer>
    </>
  );
}
