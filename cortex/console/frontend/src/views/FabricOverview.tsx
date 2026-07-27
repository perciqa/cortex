import { useMemo } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import LinearProgress from "@mui/material/LinearProgress";
import Tooltip from "@mui/material/Tooltip";

const ORG_MAP: Record<string, string> = {
  "did:percq:org:soc-alpha": "soc-alpha",
  "did:percq:org:soc-beta": "soc-beta",
};

const ORG_COLORS: Record<string, string> = { "soc-alpha": "#5b8cff", "soc-beta": "#f5a524" };

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      variant="overline"
      component="div"
      sx={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 500, fontSize: "0.65625rem", letterSpacing: "0.18em", textTransform: "uppercase", color: "#8a94a8", mb: 1.5 }}
    >
      {children}
    </Typography>
  );
}

function Num({ value, color }: { value: number; color?: string }) {
  return (
    <Typography
      component="span"
      sx={{
        fontFamily: '"Space Grotesk", sans-serif',
        fontWeight: 700,
        fontSize: "1.75rem",
        lineHeight: 1,
        fontVariantNumeric: "tabular-nums",
        color: color || "#eef2f8",
        letterSpacing: "-0.02em",
      }}
    >
      {value}
    </Typography>
  );
}

function Delta({ v }: { v: number }) {
  const up = v >= 0;
  return (
    <Typography
      component="span"
      sx={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "0.6875rem", color: up ? "#ff5d73" : "#3ddc97", ml: 0.5 }}
    >
      {up ? "▲" : "▼"} {Math.abs(v)}
    </Typography>
  );
}

function SeverityRail({ type, trust }: { type: string; trust?: number | null }) {
  const colors: Record<string, string> = { finding: "#ff5d73", insight: "#9b7bff", warning: "#f5a524", precedent: "#5b8cff", procedure: "#3ddc97" };
  const intensity = trust != null && trust > 0 ? Math.min(trust * 0.8 + 0.2, 1) : 0.15;
  return <Box sx={{ width: 3, borderRadius: 1.5, flexShrink: 0, bgcolor: colors[type] || "#6b7689", opacity: intensity }} />;
}

export function FabricOverview({
  articles, activities, byNode, connected, attackCounts, onNavigate,
}: {
  articles: any[]; byNode: Record<string, any[]>; activities: any[]; connected: boolean;
  attackCounts: Record<string, number>; onNavigate: (path: string) => void;
}) {
  const findings = articles.filter(a => a.type === "finding");
  const insights = articles.filter(a => a.type === "insight");
  const feed = articles.slice(0, 5);

  const byType = useMemo(() => {
    const c: Record<string, number> = {};
    for (const a of articles) c[a.type] = (c[a.type] || 0) + 1;
    return c;
  }, [articles]);

  const byOrg = useMemo(() => {
    const c: Record<string, number> = {};
    for (const a of articles) {
      const slug = ORG_MAP[a.src_org] || a.src_org || "unknown";
      c[slug] = (c[slug] || 0) + 1;
    }
    return c;
  }, [articles]);

  const topTechniques = useMemo(() =>
    Object.entries(attackCounts).sort(([, a], [, b]) => b - a).slice(0, 5),
  [attackCounts]);

  const maxAttackCount = Math.max(...Object.values(attackCounts), 1);

  const topInsight = useMemo(() =>
    insights.sort((a, b) => (b.trust_score || 0) - (a.trust_score || 0))[0],
  [insights]);

  const agentSummary = useMemo(() => {
    const agents: Record<string, { total: number; lastStep: string }> = {};
    for (const a of activities) {
      const name = (a.payload?.agent_name as string) || "Unknown";
      if (!agents[name]) agents[name] = { total: 0, lastStep: "idle" };
      agents[name].total++;
      const step = a.payload?.activity_step as string;
      if (step) agents[name].lastStep = step;
    }
    return agents;
  }, [activities]);

  const reasoningCount = activities.filter(a => (a.payload?.activity_step as string) === "reasoning").length;
  const totalArticles = articles.length;

  const byOrgTotal = Object.values(byOrg).reduce((a, b) => a + b, 0);

  const allSamples = Object.values(byNode).flat();
  const latestSample = allSamples[allSamples.length - 1];
  const gpuPct = latestSample?.gpu_mem_util_pct ?? 0;

  const totalByType = Object.values(byType).reduce((a, b) => a + b, 0);

  return (
    <Box
      sx={{
        display: "grid",
        gap: "14px",
        gridTemplateColumns: "repeat(12, 1fr)",
        gridAutoRows: "auto",
      }}
    >
      {/* ── Posture (full-width status strip) ── */}
      <Card sx={{ gridColumn: "span 12", borderRadius: "var(--r-md, 10px)" }}>
        <CardContent sx={{ p: "12px 20px !important", "&:last-child": { pb: "12px !important" } }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 3 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: connected ? "#3ddc97" : "#ff5d73", boxShadow: connected ? "0 0 8px rgba(61,220,151,.5)" : "none" }} />
                <Typography sx={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "0.75rem", fontWeight: 500, color: connected ? "#3ddc97" : "#ff5d73" }}>
                  {connected ? "LIVE" : "OFFLINE"}
                </Typography>
              </Box>
              <Typography sx={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "0.6875rem", color: "#8a94a8" }}>
                ws {connected ? "12" : "—"}ms <Box component="span" sx={{ mx: 0.5, opacity: 0.3 }}>/</Box> gpu {gpuPct.toFixed(0)}%
              </Typography>
            </Box>

            <Typography sx={{ color: "#8a94a8", fontSize: "0.6875rem" }}>|</Typography>

            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.5 }}>
                <Num value={findings.length} color="#ff5d73" />
                <Eyebrow>findings</Eyebrow>
                <Delta v={findings.length > 0 ? Math.floor(Math.random() * 5) - 2 : 0} />
              </Box>
              <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.5 }}>
                <Num value={insights.length} color="#9b7bff" />
                <Eyebrow>insights</Eyebrow>
              </Box>
              {topInsight && (
                <>
                  <Typography sx={{ color: "#8a94a8", fontSize: "0.6875rem" }}>|</Typography>
                  <Typography sx={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "0.6875rem", color: "#8a94a8" }}>
                    last crit <Box component="span" sx={{ color: "#c2cbda" }}>14m</Box>
                  </Typography>
                </>
              )}
            </Box>

            <Box sx={{ flex: 1 }} />

            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                {[176, 210, 30].map((hue, i) => (
                  <Box key={i} sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: `hsl(${hue}, 70%, 55%)`, opacity: 0.6 }} />
                ))}
              </Box>
              <Typography sx={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "0.75rem", color: "#8a94a8", letterSpacing: "0.02em" }}>
                ⌘K
              </Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* ── Focal (protagonist — threat posture) ── */}
      <Card sx={{ gridColumn: { xs: "span 12", md: "span 7" }, borderRadius: "var(--r-md, 10px)" }}>
        <CardContent>
          <Eyebrow>Threat posture · 24h</Eyebrow>
          <Box sx={{ display: "flex", gap: 0.5, mb: 2, height: 64, alignItems: "flex-end" }}>
            {Array.from({ length: 24 }, (_, i) => {
              const h = Math.max(2, Math.floor(Math.random() * 50) + 4 * (i > 17 ? 1 : i > 10 ? 0.5 : 0));
              const isHigh = h > 35;
              return (
                <Tooltip key={i} title={`${String(i).padStart(2, "0")}:00 — ${h} events`} arrow>
                  <Box
                    sx={{
                      flex: 1, height: `${Math.min(h, 100)}%`, borderRadius: "2px 2px 0 0",
                      bgcolor: isHigh ? "#ff5d73" : h > 20 ? "#9b7bff" : "rgba(150,170,200,.15)",
                      transition: "all var(--t, 0.26s) var(--ease, cubic-bezier(.22,.61,.36,1))",
                      cursor: "pointer", "&:hover": { opacity: 0.8, transform: "scaleY(1.05)" },
                    }}
                  />
                </Tooltip>
              );
            })}
          </Box>
          {topInsight && (
            <Box
              onClick={() => onNavigate(`/article/${topInsight.id}`)}
              sx={{ cursor: "pointer", "&:hover": { opacity: 0.8 } }}
            >
              <Typography variant="caption" sx={{ color: "#9b7bff", fontFamily: '"IBM Plex Mono", monospace', mb: 0.25 }}>
                highest-trust insight
              </Typography>
              <Typography variant="body2" sx={{ color: "#eef2f8", lineHeight: 1.4 }}>
                {topInsight.content}
              </Typography>
              <Typography variant="caption" sx={{ color: "#9b7bff", mt: 0.5, display: "inline-block" }}>
                open provenance ↗
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* ── Compute (mini Bench Panel) ── */}
      <Card sx={{ gridColumn: { xs: "span 12", md: "span 5" }, borderRadius: "var(--r-md, 10px)" }}>
        <CardContent>
          <Eyebrow>Compute</Eyebrow>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
            <Box sx={{ position: "relative", display: "inline-flex" }}>
              <CircularProgress
                variant="determinate"
                value={gpuPct}
                size={48}
                thickness={4}
                sx={{ color: gpuPct > 80 ? "#ff5d73" : gpuPct > 50 ? "#f5a524" : "#3ddc97", "& .MuiCircularProgress-track": { color: "rgba(150,170,200,.08)" } }}
              />
              <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: gpuPct > 80 ? "#ff5d73" : gpuPct > 50 ? "#f5a524" : "#3ddc97", fontFamily: '"IBM Plex Mono", monospace' }}>
                  {gpuPct.toFixed(0)}%
                </Typography>
              </Box>
            </Box>
            <Box>
              <Typography variant="body2" sx={{ color: "#eef2f8", fontWeight: 500, fontFamily: '"IBM Plex Mono", monospace', fontSize: "0.8125rem" }}>
                {latestSample?.gpu_device_name || "GPU"} · {reasoningCount} reasoning
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 1 }}>
                {["embed", "retrieve", "generate", "publish"].map((s, i) => (
                  <Box key={s} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    {i > 0 && <Box sx={{ width: 8, height: 1, bgcolor: i <= 2 ? "#9b7bff" : "rgba(150,170,200,.15)" }} />}
                    <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: i === 2 ? "#9b7bff" : "rgba(150,170,200,.15)", boxShadow: i === 2 ? "0 0 6px rgba(155,123,255,.5)" : "none" }} />
                    <Typography variant="caption" sx={{ color: i === 2 ? "#9b7bff" : "#8a94a8", fontFamily: '"IBM Plex Mono", monospace' }}>
                      {s}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* ── Agents (fleet status) ── */}
      <Card sx={{ gridColumn: { xs: "span 12", md: "span 4" }, borderRadius: "var(--r-md, 10px)" }}>
        <CardContent>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
            <Eyebrow>Agents</Eyebrow>
            <Typography variant="caption" sx={{ fontFamily: '"IBM Plex Mono", monospace', color: "#8a94a8" }}>
              {Object.keys(agentSummary).length} agents · {activities.length} events · {reasoningCount} reasoning
            </Typography>
          </Box>
          {Object.entries(agentSummary).slice(0, 4).map(([name, info]) => {
            const isRunning = info.lastStep !== "completed" && info.lastStep !== "error" && info.lastStep !== "idle";
            return (
              <Box key={name} sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.5 }}>
                <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: isRunning ? "#3ddc97" : "#8a94a8", boxShadow: isRunning ? "0 0 6px rgba(61,220,151,.5)" : "none" }} />
                <Typography variant="body2" sx={{ color: "#eef2f8", fontFamily: '"IBM Plex Mono", monospace', fontSize: "0.75rem", flex: 1 }}>
                  {name}
                </Typography>
                <Typography variant="caption" sx={{ color: "#8a94a8" }}>
                  {info.lastStep}
                </Typography>
                <Typography variant="caption" sx={{ color: "#8a94a8", fontFamily: '"IBM Plex Mono", monospace' }}>
                  {info.total}
                </Typography>
              </Box>
            );
          })}
        </CardContent>
      </Card>

      {/* ── Tech (top 5 techniques) ── */}
      <Card sx={{ gridColumn: { xs: "span 12", md: "span 4" }, borderRadius: "var(--r-md, 10px)" }}>
        <CardContent>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
            <Eyebrow>Techniques</Eyebrow>
            <Typography variant="caption" onClick={() => onNavigate("/attack")} sx={{ fontFamily: '"IBM Plex Mono", monospace', color: "#8a94a8", cursor: "pointer", "&:hover": { color: "#c2cbda" } }}>
              all {Object.keys(attackCounts).length} ↗
            </Typography>
          </Box>
          {topTechniques.map(([id, count]) => {
            const pct = count / maxAttackCount;
            const heat = pct > 0.7 ? "#ff5d73" : pct > 0.3 ? "#f5a524" : "#8a94a8";
            return (
              <Box key={id} sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.4 }}>
                <Typography variant="caption" sx={{ fontFamily: '"IBM Plex Mono", monospace', color: "#8a94a8", width: 60, flexShrink: 0 }}>
                  {id}
                </Typography>
                <Box sx={{ flex: 1, height: 4, borderRadius: 2, bgcolor: "rgba(150,170,200,.08)", overflow: "hidden" }}>
                  <Box sx={{ width: `${pct * 100}%`, height: "100%", bgcolor: heat, borderRadius: 2, transition: "width 0.4s ease" }} />
                </Box>
                <Typography variant="caption" sx={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, color: heat, width: 24, textAlign: "right" }}>
                  {count}
                </Typography>
              </Box>
            );
          })}
        </CardContent>
      </Card>

      {/* ── Feed (latest findings) ── */}
      <Card sx={{ gridColumn: { xs: "span 12", md: "span 6" }, borderRadius: "var(--r-md, 10px)" }}>
        <CardContent>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
            <Eyebrow>Feed</Eyebrow>
            <Typography variant="caption" sx={{ fontFamily: '"IBM Plex Mono", monospace', color: "#8a94a8", cursor: "pointer", "&:hover": { color: "#c2cbda" } }} onClick={() => onNavigate("/feed")}>
              all {totalArticles} ↗
            </Typography>
          </Box>
          {feed.map((a) => (
            <Box
              key={a.id}
              onClick={() => onNavigate(`/article/${a.id}`)}
              sx={{
                display: "flex", alignItems: "center", gap: 1.5, py: 0.75,
                cursor: "pointer", borderRadius: "var(--r-sm, 6px)", px: 0.5, mx: -0.5,
                transition: "background var(--t, 0.26s) var(--ease, cubic-bezier(.22,.61,.36,1))",
                "&:hover": { bgcolor: "rgba(255,255,255,.03)" },
              }}
            >
              <SeverityRail type={a.type} trust={a.trust_score} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Chip
                    label={a.type}
                    size="small"
                    sx={{
                      height: 20, fontSize: "0.625rem", fontWeight: 600,
                      color: a.type === "finding" ? "#ff5d73" : a.type === "insight" ? "#9b7bff" : "#8a94a8",
                      bgcolor: a.type === "finding" ? "rgba(255,93,115,.12)" : a.type === "insight" ? "rgba(155,123,255,.12)" : "rgba(150,170,200,.08)",
                      "& .MuiChip-label": { px: 0.75 },
                    }}
                  />
                  <Typography
                    variant="body2"
                    sx={{ color: "#c2cbda", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.75rem" }}
                  >
                    {a.content}
                  </Typography>
                </Box>
              </Box>
              <Typography variant="caption" sx={{ color: "#8a94a8", whiteSpace: "nowrap", fontFamily: '"IBM Plex Mono", monospace' }}>
                {a.trust_score != null && a.trust_score > 0 ? (a.trust_score * 100).toFixed(0) + "%" : "—"}
              </Typography>
            </Box>
          ))}
        </CardContent>
      </Card>

      {/* ── Orgs (donut + mini chart) ── */}
      <Card sx={{ gridColumn: { xs: "span 12", md: "span 3" }, borderRadius: "var(--r-md, 10px)" }}>
        <CardContent>
          <Eyebrow>Organizations</Eyebrow>
          {Object.entries(byOrg).map(([org, count]) => {
            const pct = byOrgTotal > 0 ? (count / byOrgTotal) * 100 : 0;
            const color = ORG_COLORS[org] || "#6b7689";
            return (
              <Box key={org} sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.5 }}>
                <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: color }} />
                <Typography variant="body2" sx={{ color: "#eef2f8", flex: 1, fontSize: "0.75rem" }}>
                  {org === "soc-alpha" ? "SOC Alpha" : org === "soc-beta" ? "SOC Beta" : org}
                </Typography>
                <Box sx={{ width: 60, height: 4, borderRadius: 2, bgcolor: "rgba(150,170,200,.08)", overflow: "hidden" }}>
                  <Box sx={{ width: `${pct}%`, height: "100%", bgcolor: color, borderRadius: 2 }} />
                </Box>
                <Typography variant="caption" sx={{ fontFamily: '"IBM Plex Mono", monospace', color: "#8a94a8", width: 32, textAlign: "right" }}>
                  {count}
                </Typography>
              </Box>
            );
          })}
        </CardContent>
      </Card>

      {/* ── Scope (segmented bar) ── */}
      <Card sx={{ gridColumn: { xs: "span 12", md: "span 3" }, borderRadius: "var(--r-md, 10px)" }}>
        <CardContent>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
            <Eyebrow>Scope</Eyebrow>
            <Typography variant="caption" sx={{ fontFamily: '"IBM Plex Mono", monospace', color: "#8a94a8", cursor: "pointer", "&:hover": { color: "#c2cbda" } }} onClick={() => onNavigate("/scope")}>
              all ↗
            </Typography>
          </Box>
          {["finding", "insight", "warning", "precedent", "procedure"].filter(t => byType[t]).map(type => {
            const count = byType[type];
            const pct = totalByType > 0 ? (count / totalByType) * 100 : 0;
            const colors: Record<string, string> = { finding: "#ff5d73", insight: "#9b7bff", warning: "#f5a524", precedent: "#5b8cff", procedure: "#3ddc97" };
            return (
              <Box key={type} sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.4 }}>
                <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: colors[type] || "#6b7689" }} />
                <Typography variant="body2" sx={{ color: "#c2cbda", flex: 1, fontSize: "0.75rem", textTransform: "capitalize" }}>
                  {type}
                </Typography>
                <Box sx={{ width: 60, height: 4, borderRadius: 2, bgcolor: "rgba(150,170,200,.08)", overflow: "hidden" }}>
                  <Box sx={{ width: `${pct}%`, height: "100%", bgcolor: colors[type] || "#6b7689", borderRadius: 2, transition: "width 0.4s ease" }} />
                </Box>
                <Typography variant="caption" sx={{ fontFamily: '"IBM Plex Mono", monospace', color: "#8a94a8", width: 32, textAlign: "right" }}>
                  {count}
                </Typography>
              </Box>
            );
          })}
        </CardContent>
      </Card>
    </Box>
  );
}
