"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Card, Loader, Table, Text } from "@mantine/core";
import { LineChart } from "@mantine/charts";
import { notifications } from "@mantine/notifications";
import { PageInfo } from "@/components/PageInfo";
import { timeAgo } from "@/lib/format";
import { listEvals, getEvalScores, type EvalSummary, type ScorePoint } from "@/lib/api";
import { useArgusWebSocket } from "@/hooks/useArgusWebSocket";
import type { WsEvent } from "@/hooks/useArgusWebSocket";

function ScoreRing({ score }: { score: number }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const pct = score / 100;
  const color = score >= 70 ? "#059669" : score >= 50 ? "#d97706" : "#dc2626";

  return (
    <svg width={90} height={90} style={{ display: "block" }}>
      <circle cx={45} cy={45} r={r} fill="none" stroke="#f1f5f9" strokeWidth={8} />
      <circle
        cx={45} cy={45} r={r} fill="none"
        stroke={color} strokeWidth={8}
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - pct)}
        strokeLinecap="round"
        transform="rotate(-90 45 45)"
        style={{ transition: "stroke-dashoffset 0.8s ease" }}
      />
      <text x={45} y={49} textAnchor="middle" fontSize={18} fontWeight={700} fill={color}
            fontFamily="var(--font-inter)">
        {score.toFixed(0)}
      </text>
    </svg>
  );
}

const VERDICT_PROPS = {
  pass: { color: "green",  label: "Pass" },
  warn: { color: "orange", label: "Warn" },
  fail: { color: "red",    label: "Fail" },
};

export default function EvalsPage() {
  const [evals, setEvals]         = useState<EvalSummary[]>([]);
  const [scores, setScores]       = useState<ScorePoint[]>([]);
  const [total, setTotal]         = useState(0);
  const [avgScore, setAvgScore]   = useState<number | null>(null);
  const [passRate, setPassRate]   = useState<number | null>(null);
  const [loading, setLoading]     = useState(true);
  const [wsLog, setWsLog]         = useState<string[]>([]);

  const { status: wsStatus } = useArgusWebSocket(
    useCallback((event: WsEvent) => {
      setWsLog((prev) => [...prev.slice(-4), `Received: ${event.event}`]);
      if (event.event === "eval_complete") {
        const d = event.data as unknown as EvalSummary;
        setEvals((prev) => [d, ...prev.slice(0, 49)]);
        setTotal((n) => n + 1);
        notifications.show({ title: "Eval complete", message: `Score ${d.overall_score?.toFixed(1) ?? "—"} · ${d.verdict ?? ""}`, color: "teal", autoClose: 4000 });
      }
    }, [])
  );

  useEffect(() => {
    Promise.all([listEvals(50), getEvalScores(7)]).then(([e, s]) => {
      setEvals(e.evals);
      setTotal(e.total);
      setAvgScore(e.avg_score);
      setPassRate(e.pass_rate);
      setScores(s);
    }).catch(() => { }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", paddingTop: 80 }}>
        <Loader color="blue" />
      </div>
    );
  }

  const passCount = evals.filter((e) => e.verdict === "pass").length;
  const failCount = evals.filter((e) => e.verdict === "fail").length;
  const warnCount = evals.filter((e) => e.verdict === "warn").length;

  const scoreColor = avgScore != null
    ? (avgScore >= 70 ? "#059669" : avgScore >= 50 ? "#d97706" : "#dc2626")
    : "var(--dark-grey)";

  const judgeModel = evals[0]?.judge_model ?? "gemma2:9b";

  return (
    <>
      <div className="page-head">
        <div className="page-head-left">
          <h1 style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            Evals
            <PageInfo description="Automated LLM quality scoring — pass rates, score trends, verdict breakdowns, and judge model configuration." />
          </h1>
          <ul className="breadcrumb">
            <li><span style={{ color: "var(--dark-grey)" }}>Argus</span></li>
            <li className="breadcrumb-sep">›</li>
            <li><span className="breadcrumb-active">Evals</span></li>
          </ul>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className={`live-badge ${wsStatus === "connected" ? "connected" : "disconnected"}`}>
            <span className="live-dot" />
            {wsStatus === "connected" ? "Live" : "Connecting…"}
          </span>
          {wsLog.length > 0 && (
            <span style={{ fontSize: 10, color: "var(--dark-grey)", fontFamily: "var(--font-mono)" }}>
              {wsLog[wsLog.length - 1]}
            </span>
          )}
        </div>
      </div>

      {evals.length === 0 ? (
        <Card p="xl" ta="center" radius="md" shadow="xs" withBorder>
          <Text size="sm" c="dimmed" mb={4}>No evals yet.</Text>
          <Text size="xs" c="dimmed">
            Evals run automatically in the background after each trace is ingested.
          </Text>
        </Card>
      ) : (
        <>
          <div className="box-info" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
            <div className="box-info-item" style={{ flexDirection: "column", alignItems: "flex-start", gap: 10 }}>
              <p className="evals-stat-label">Avg Score</p>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                {avgScore != null ? (
                  <ScoreRing score={avgScore} />
                ) : (
                  <span style={{ fontSize: 28, fontWeight: 700, color: "var(--dark-grey)" }}>—</span>
                )}
                {avgScore != null && (
                  <div>
                    <div style={{ fontSize: 26, fontWeight: 700, color: scoreColor, lineHeight: 1.1, letterSpacing: "-0.03em" }}>
                      {avgScore.toFixed(0)}
                      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--dark-grey)", marginLeft: 2 }}>/100</span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--dark-grey)", marginTop: 3 }}>
                      {avgScore >= 70 ? "Good" : avgScore >= 50 ? "Fair" : "Poor"}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="box-info-item" style={{ flexDirection: "column", alignItems: "flex-start", gap: 10 }}>
              <p className="evals-stat-label">Pass Rate</p>
              <div style={{ fontSize: 32, fontWeight: 700, color: "var(--dark)", lineHeight: 1.1, letterSpacing: "-0.03em" }}>
                {passRate != null ? `${(passRate * 100).toFixed(0)}%` : "—"}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Badge color="green" variant="light" size="xs">{passCount} pass</Badge>
                <Badge color="orange" variant="light" size="xs">{warnCount} warn</Badge>
                <Badge color="red" variant="light" size="xs">{failCount} fail</Badge>
              </div>
            </div>

            <div className="box-info-item" style={{ flexDirection: "column", alignItems: "flex-start", gap: 10 }}>
              <p className="evals-stat-label">Total Evals</p>
              <div style={{ fontSize: 32, fontWeight: 700, color: "var(--dark)", lineHeight: 1.1, letterSpacing: "-0.03em" }}>
                {total}
              </div>
              <div style={{ fontSize: 12, color: "var(--dark-grey)" }}>
                Fireworks serverless · ~$0.00042/eval
              </div>
            </div>

            <div className="box-info-item" style={{ flexDirection: "column", alignItems: "flex-start", gap: 10 }}>
              <p className="evals-stat-label">Judge Model</p>
              <div style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--dark)",
                wordBreak: "break-all",
                lineHeight: 1.5,
                fontFamily: "var(--font-mono)",
                flex: 1,
              }}>
                {judgeModel}
              </div>
              <Badge variant="light" color="green" size="xs">Local · free</Badge>
            </div>
          </div>

          {scores.length > 0 && (
            <Card p="md" mb={24} radius="md" shadow="xs" withBorder>
              <Text size="sm" fw={600} mb={16}>Score Trend (7 days)</Text>
              <LineChart
                h={200}
                data={scores}
                dataKey="date"
                series={[{ name: "avg_score", label: "Avg score", color: "blue" }]}
                curveType="monotone"
                withDots={scores.length < 10}
                yAxisProps={{ domain: [0, 100] }}
                gridAxis="y"
                tickLine="none"
                referenceLines={[
                  { y: 70, label: "Pass threshold", color: "#059669" },
                  { y: 50, label: "Warn threshold", color: "#d97706" },
                ]}
              />
            </Card>
          )}

          <Card p={0} style={{ overflow: "hidden" }} radius="md" shadow="xs" withBorder>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--color-border)" }}>
              <Text size="sm" fw={600}>Recent Evals</Text>
            </div>
            <Table className="trace-table" horizontalSpacing="md" verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Verdict</Table.Th>
                  <Table.Th>Score</Table.Th>
                  <Table.Th>Agent</Table.Th>
                  <Table.Th>Explanation</Table.Th>
                  <Table.Th>When</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {evals.map((e) => {
                  const vp = VERDICT_PROPS[e.verdict] ?? VERDICT_PROPS.warn;
                  return (
                    <Table.Tr key={e.eval_id}>
                      <Table.Td>
                        <Badge color={vp.color} variant="light" size="sm">{vp.label}</Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" fw={600} className="mono"
                          c={e.overall_score >= 70 ? "green" : e.overall_score >= 50 ? "orange" : "red"}>
                          {e.overall_score.toFixed(1)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{e.agent_name ?? "—"}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed" lineClamp={1} maw={320}>{e.explanation || "—"}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">{timeAgo(e.evaluated_at)}</Text>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Card>
        </>
      )}
    </>
  );
}
