"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AreaChart } from "@mantine/charts";
import {
  IconCoin, IconBolt, IconShieldCheck, IconUsers,
  IconTimeline, IconCoins, IconChartBar,
  IconArrowRight, IconCheck, IconAlertCircle, IconAlertTriangle,
  IconActivity, IconTrendingUp,
} from "@tabler/icons-react";
import { PageInfo } from "@/components/PageInfo";
import { timeAgo } from "@/lib/format";
import {
  getFinOpsSummary, getTimeseries, listTraces, listEvals,
  type TraceSummary, type FinOpsSummary, type TimeseriesPoint, type EvalListResponse,
} from "@/lib/api";
import { useArgusWebSocket } from "@/hooks/useArgusWebSocket";
import type { WsEvent } from "@/hooks/useArgusWebSocket";

function fmtCost(usd: number) {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function fmtTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function greet() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const STATUS_COLOR: Record<string, string> = {
  ok: "var(--green)", error: "var(--red)", drift: "var(--orange)", timeout: "var(--dark-grey)",
};
const STATUS_BG: Record<string, string> = {
  ok: "var(--light-green)", error: "var(--light-red)", drift: "var(--light-orange)", timeout: "var(--grey)",
};
const STATUS_LABEL: Record<string, string> = {
  ok: "pass", error: "fail", drift: "drift", timeout: "timeout",
};
const STATUS_ICON: Record<string, React.ReactNode> = {
  ok:      <IconCheck size={10} strokeWidth={2.5} />,
  error:   <IconAlertCircle size={10} strokeWidth={2.5} />,
  drift:   <IconAlertTriangle size={10} strokeWidth={2.5} />,
  timeout: <IconAlertCircle size={10} strokeWidth={2.5} />,
};

function MiniSparkline({ data }: { data: TimeseriesPoint[] }) {
  if (data.length < 2) return null;
  const vals = data.map((d) => d.total_cost_usd);
  const max = Math.max(...vals, 0.000001);
  const w = 80, h = 28;
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * w;
    const y = h - (v / max) * h;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block", opacity: 0.7 }}>
      <polyline points={pts} fill="none" stroke="var(--blue)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function FeedRow({ trace, isNew }: { trace: TraceSummary; isNew: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isNew && ref.current) {
      ref.current.animate([
        { opacity: 0, transform: "translateY(-8px)" },
        { opacity: 1, transform: "translateY(0)" },
      ], { duration: 350, easing: "ease-out", fill: "forwards" });
    }
  }, [isNew]);

  const sc = STATUS_COLOR[trace.status] ?? "var(--dark-grey)";
  const sb = STATUS_BG[trace.status] ?? "var(--grey)";

  return (
    <div ref={ref} className="feed-row">
      <span className="feed-status" style={{ background: sb, color: sc }}>
        {STATUS_ICON[trace.status]}
        {STATUS_LABEL[trace.status] ?? trace.status}
      </span>
      <div className="feed-agent">{trace.agent_name}</div>
      <div className="feed-task">{trace.task ?? "—"}</div>
      <span className="feed-meta mono">{fmtCost(trace.total_cost_usd)}</span>
      <span className="feed-meta">{timeAgo(trace.created_at)}</span>
    </div>
  );
}

export default function OverviewPage() {
  const [traces, setTraces]   = useState<TraceSummary[]>([]);
  const [finops, setFinops]   = useState<FinOpsSummary | null>(null);
  const [series, setSeries]   = useState<TimeseriesPoint[]>([]);
  const [evals, setEvals]     = useState<EvalListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [newIds, setNewIds]   = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([
      listTraces({ limit: 12 }),
      getFinOpsSummary(),
      getTimeseries(7),
      listEvals(20),
    ]).then(([t, f, s, e]) => {
      setTraces(t.traces);
      setFinops(f);
      setSeries(s);
      setEvals(e);
      setOffline(false);
    }).catch(() => {
      setOffline(true);
    }).finally(() => setLoading(false));
  }, []);

  const { status } = useArgusWebSocket(
    useCallback((event: WsEvent) => {
      if (event.event === "new_trace") {
        const t = event.data as unknown as TraceSummary;
        setTraces((prev) => [t, ...prev.slice(0, 11)]);
        setNewIds((prev) => new Set([...prev, t.trace_id]));
        setTimeout(() => setNewIds((prev) => { const n = new Set(prev); n.delete(t.trace_id); return n; }), 2000);
      }
    }, [])
  );

  const today     = finops?.today;
  const allTime   = finops?.all_time;
  const thisWeek  = finops?.this_week;
  const passRate  = evals?.pass_rate ?? null;
  const avgScore  = evals?.avg_score ?? null;
  const agentCount = new Set(traces.map((t) => t.agent_name)).size;
  const passCount  = traces.filter((t) => t.status === "ok").length;
  const tracePassRate = traces.length > 0 ? passCount / traces.length : null;

  const agentMap = new Map<string, { traces: number; cost: number; errors: number }>();
  for (const t of traces) {
    const cur = agentMap.get(t.agent_name) ?? { traces: 0, cost: 0, errors: 0 };
    agentMap.set(t.agent_name, {
      traces: cur.traces + 1,
      cost: cur.cost + t.total_cost_usd,
      errors: cur.errors + (t.status !== "ok" ? 1 : 0),
    });
  }
  const leaderboard = [...agentMap.entries()]
    .map(([name, d]) => ({ name, ...d }))
    .sort((a, b) => b.traces - a.traces)
    .slice(0, 5);

  const weekCost  = thisWeek?.total_cost_usd ?? 0;
  const todayCost = today?.total_cost_usd ?? 0;

  if (loading) {
    return (
      <div className="overview-loading">
        <div className="overview-loading-ring" />
        <span>Loading Argus…</span>
      </div>
    );
  }

  if (offline) {
    return (
      <>
        <div className="page-head">
          <div className="page-head-left"><h1>Overview</h1></div>
        </div>
        <div className="offline-card">
          <div className="offline-card-icon">⚠️</div>
          <div>
            <div className="offline-card-title">Server offline</div>
            <div className="offline-card-body">
              Cannot reach <code>localhost:8000</code>. Start the server then refresh.
            </div>
            <pre className="offline-card-pre">{`set -a && source .env && set +a\n.venv/bin/uvicorn app.main:app --reload --port 8000 --app-dir packages/server`}</pre>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="ov-hero">
        <div className="ov-hero-left">
          <div className="ov-greeting">{greet()}</div>
          <h1 className="ov-title" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            Agent Observatory
            <PageInfo description="Real-time overview of agent reliability — cost, pass rates, active agents, and live activity feed." />
          </h1>
          <p className="ov-subtitle">
            {agentCount} agent{agentCount !== 1 ? "s" : ""} · {traces.length} recent traces
            {passRate != null && ` · ${(passRate * 100).toFixed(0)}% passing`}
          </p>
        </div>
        <div className="ov-hero-right">
          <span className={`live-badge ${status === "connected" ? "connected" : "disconnected"}`}>
            <span className="live-dot" />
            {status === "connected" ? "Live" : "Reconnecting…"}
          </span>
          {(allTime?.savings_usd ?? 0) > 0 && (
            <div className="ov-savings-chip">
              <IconBolt size={13} />
              {fmtCost(allTime!.savings_usd)} saved all-time
            </div>
          )}
        </div>
      </div>

      <ul className="box-info" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <li className="box-info-item">
          <div className="box-info-icon blue"><IconCoin size={22} stroke={1.6} /></div>
          <div className="box-info-text">
            <h3 className="mono">{fmtCost(todayCost)}</h3>
            <p>Cost Today</p>
            <span className="sub">{fmtCost(weekCost)} this week</span>
          </div>
        </li>
        <li className="box-info-item">
          <div className="box-info-icon green"><IconBolt size={22} stroke={1.6} /></div>
          <div className="box-info-text">
            <h3 className="mono">{fmtTokens(today?.local_tokens ?? 0)}</h3>
            <p>Local Tokens</p>
            <span className="sub" style={{ color: "var(--green)" }}>$0.00 · free tier</span>
          </div>
        </li>
        <li className="box-info-item">
          <div className="box-info-icon violet"><IconShieldCheck size={22} stroke={1.6} /></div>
          <div className="box-info-text">
            <h3>
              {passRate != null
                ? `${(passRate * 100).toFixed(0)}%`
                : tracePassRate != null
                ? `${(tracePassRate * 100).toFixed(0)}%`
                : "—"}
            </h3>
            <p>Pass Rate</p>
            {avgScore != null && <span className="sub">avg score {avgScore.toFixed(1)}/100</span>}
          </div>
        </li>
        <li className="box-info-item">
          <div className="box-info-icon orange"><IconUsers size={22} stroke={1.6} /></div>
          <div className="box-info-text">
            <h3>{agentCount}</h3>
            <p>Active Agents</p>
            <span className="sub">{today?.trace_count ?? traces.length} traces today</span>
          </div>
        </li>
      </ul>

      <div className="ov-grid" style={{ marginBottom: 20 }}>
        <div className="panel-block ov-feed-panel">
          <div className="panel-block-head">
            <h3>Live Activity</h3>
            <IconActivity size={16} color="var(--dark-grey)" />
            <Link href="/argus/traces" className="ov-view-all">
              View all <IconArrowRight size={12} />
            </Link>
          </div>
          {traces.length === 0 ? (
            <div className="ov-empty">
              <IconTimeline size={32} color="var(--dark-grey)" />
              <p>No traces yet</p>
              <span>Instrument your agent with the Argus SDK to see live data here.</span>
            </div>
          ) : (
            <div className="feed-list">
              <div className="feed-header">
                <span>Status</span>
                <span>Agent</span>
                <span>Task</span>
                <span>Cost</span>
                <span>When</span>
              </div>
              {traces.map((t) => (
                <FeedRow key={t.trace_id} trace={t} isNew={newIds.has(t.trace_id)} />
              ))}
            </div>
          )}
        </div>

        <div className="ov-right-col">
          <div className="panel-block" style={{ marginBottom: 16 }}>
            <div className="panel-block-head">
              <h3>Cost — 7 days</h3>
              <IconCoins size={16} color="var(--dark-grey)" />
              <MiniSparkline data={series} />
            </div>
            {series.length === 0 ? (
              <div className="ov-empty" style={{ padding: "24px 0" }}>
                <p style={{ margin: 0 }}>No cost data yet</p>
              </div>
            ) : (
              <AreaChart
                h={140}
                data={series}
                dataKey="date"
                series={[{ name: "total_cost_usd", label: "Cost ($)", color: "var(--blue)" }]}
                curveType="monotone"
                withLegend={false}
                withDots={series.length < 8}
                gridAxis="y"
                tickLine="none"
                valueFormatter={(v) => fmtCost(v as number)}
                styles={{ root: { fontSize: 11 } }}
              />
            )}
          </div>

          <div className="panel-block ov-eval-card">
            <div className="panel-block-head" style={{ marginBottom: 12 }}>
              <h3>Eval Health</h3>
              <IconChartBar size={16} color="var(--dark-grey)" />
              <Link href="/argus/evals" className="ov-view-all">Details <IconArrowRight size={12} /></Link>
            </div>
            {evals && (evals.total ?? 0) > 0 ? (
              <div className="ov-eval-body">
                <div className="ov-score-ring-wrap">
                  <svg width={80} height={80}>
                    <circle cx={40} cy={40} r={30} fill="none" stroke="var(--grey)" strokeWidth={7} />
                    <circle cx={40} cy={40} r={30} fill="none"
                      stroke={passRate != null && passRate >= 0.7 ? "var(--green)" : passRate != null && passRate >= 0.5 ? "var(--orange)" : "var(--red)"}
                      strokeWidth={7}
                      strokeDasharray={2 * Math.PI * 30}
                      strokeDashoffset={2 * Math.PI * 30 * (1 - (passRate ?? 0))}
                      strokeLinecap="round"
                      transform="rotate(-90 40 40)"
                      style={{ transition: "stroke-dashoffset 1s ease" }}
                    />
                    <text x={40} y={45} textAnchor="middle" fontSize={14} fontWeight={700}
                      fill={passRate != null && passRate >= 0.7 ? "var(--green)" : passRate != null && passRate >= 0.5 ? "var(--orange)" : "var(--red)"}
                      fontFamily="var(--poppins)">
                      {passRate != null ? `${(passRate * 100).toFixed(0)}%` : "—"}
                    </text>
                  </svg>
                </div>
                <div className="ov-eval-stats">
                  <div className="ov-eval-stat">
                    <span className="ov-eval-stat-val">{evals.total}</span>
                    <span className="ov-eval-stat-lbl">evals</span>
                  </div>
                  {avgScore != null && (
                    <div className="ov-eval-stat">
                      <span className="ov-eval-stat-val">{avgScore.toFixed(1)}</span>
                      <span className="ov-eval-stat-lbl">avg score</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="ov-empty" style={{ padding: "16px 0" }}>
                <p style={{ margin: 0 }}>No evals yet</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="ov-grid-bottom">
        <div className="panel-block">
          <div className="panel-block-head">
            <h3>Agent Leaderboard</h3>
            <IconTrendingUp size={16} color="var(--dark-grey)" />
          </div>
          {leaderboard.length === 0 ? (
            <div className="ov-empty" style={{ padding: "20px 0" }}>
              <p style={{ margin: 0 }}>No agents yet</p>
            </div>
          ) : (
            <div className="ov-leaderboard">
              <div className="ov-lb-header">
                <span>Agent</span>
                <span>Traces</span>
                <span>Cost</span>
                <span>Errors</span>
              </div>
              {leaderboard.map((a, i) => {
                const errRate = a.traces > 0 ? a.errors / a.traces : 0;
                return (
                  <div key={a.name} className="ov-lb-row">
                    <div className="ov-lb-rank">{i + 1}</div>
                    <div className="ov-lb-name">{a.name}</div>
                    <div className="ov-lb-val">{a.traces}</div>
                    <div className="ov-lb-val mono">{fmtCost(a.cost)}</div>
                    <div className="ov-lb-val" style={{ color: errRate > 0.2 ? "var(--red)" : errRate > 0 ? "var(--orange)" : "var(--green)" }}>
                      {a.errors > 0 ? a.errors : "✓"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="panel-block">
          <div className="panel-block-head">
            <h3>Explore</h3>
          </div>
          <div className="ov-nav-grid">
            {[
              {
                href: "/argus/traces",
                icon: <IconTimeline size={20} />,
                label: "Traces",
                sub: "Live execution logs & spans",
                color: "var(--blue)",
                bg: "var(--light-blue)",
              },
              {
                href: "/argus/finops",
                icon: <IconCoins size={20} />,
                label: "FinOps",
                sub: "Cost breakdown & savings",
                color: "var(--green)",
                bg: "var(--light-green)",
              },
              {
                href: "/argus/evals",
                icon: <IconChartBar size={20} />,
                label: "Evals",
                sub: "LLM quality scoring",
                color: "var(--violet)",
                bg: "var(--light-violet)",
              },
            ].map(({ href, icon, label, sub, color, bg }) => (
              <Link key={href} href={href} className="ov-nav-card" style={{ "--nav-color": color, "--nav-bg": bg } as React.CSSProperties}>
                <div className="ov-nav-icon" style={{ background: bg, color }}>{icon}</div>
                <div className="ov-nav-text">
                  <div className="ov-nav-label">{label}</div>
                  <div className="ov-nav-sub">{sub}</div>
                </div>
                <IconArrowRight size={14} className="ov-nav-arrow" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
