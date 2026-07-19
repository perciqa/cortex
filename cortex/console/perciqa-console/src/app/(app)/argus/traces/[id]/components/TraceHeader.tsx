"use client";

import Link from "next/link";
import {
  IconArrowLeft,
  IconCoin,
  IconBolt,
  IconClock,
  IconBinaryTree2,
} from "@tabler/icons-react";
import type { TraceDetail } from "@/lib/api";
import { fmtMs, fmtTokens, fmtCost } from "@/lib/format";

interface EvalInfo {
  overall_score: number;
  verdict: string;
}

interface TraceHeaderProps {
  trace: TraceDetail;
  evalResult: EvalInfo | null;
}

const STATUS_BG: Record<string, string> = {
  ok: "var(--blue)",
  error: "var(--red)",
  drift: "var(--orange)",
  timeout: "var(--dark-grey)",
};
const STATUS_LABEL: Record<string, string> = {
  ok: "pass",
  error: "fail",
  drift: "drift",
  timeout: "timeout",
};

export function TraceHeader({ trace, evalResult }: TraceHeaderProps) {
  return (
    <>
      <div className="page-head">
        <div className="page-head-left">
          <h1>{trace.task ?? "Untitled trace"}</h1>
          <ul className="breadcrumb">
            <li>
              <Link
                href="/argus/traces"
                style={{ color: "var(--dark-grey)", textDecoration: "none" }}
              >
                Traces
              </Link>
            </li>
            <li className="breadcrumb-sep">›</li>
            <li>
              <span className="breadcrumb-active">
                {trace.agent_name} / {trace.trace_id.slice(0, 8)}
              </span>
            </li>
          </ul>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            className="status-badge"
            style={{
              background: STATUS_BG[trace.status] ?? "var(--dark-grey)",
            }}
          >
            {STATUS_LABEL[trace.status] ?? trace.status}
          </span>
          {evalResult && (
            <span
              className="status-badge"
              style={{
                background:
                  evalResult.verdict === "pass"
                    ? "var(--blue)"
                    : evalResult.verdict === "fail"
                      ? "var(--red)"
                      : "var(--orange)",
              }}
            >
              eval {evalResult.overall_score.toFixed(1)}
            </span>
          )}
          <Link
            href="/argus/traces"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              fontWeight: 600,
              color: "var(--blue)",
              textDecoration: "none",
            }}
          >
            <IconArrowLeft size={16} /> Back
          </Link>
        </div>
      </div>

      <ul className="box-info">
        <li className="box-info-item">
          <div className="box-info-icon blue">
            <IconClock size={32} stroke={1.6} />
          </div>
          <div className="box-info-text">
            <h3 className="mono">{fmtMs(trace.duration_ms)}</h3>
            <p>Duration</p>
          </div>
        </li>
        <li className="box-info-item">
          <div className="box-info-icon green">
            <IconBolt size={32} stroke={1.6} />
          </div>
          <div className="box-info-text">
            <h3 className="mono">{fmtTokens(trace.total_tokens)}</h3>
            <p>Total Tokens</p>
            <span className="sub">
              {fmtTokens(trace.local_tokens)} local / {fmtTokens(trace.cloud_tokens)} cloud
            </span>
          </div>
        </li>
        <li className="box-info-item">
          <div className="box-info-icon violet">
            <IconCoin size={32} stroke={1.6} />
          </div>
          <div className="box-info-text">
            <h3 className="mono">{fmtCost(trace.total_cost_usd)}</h3>
            <p>Total Cost</p>
            <span className="sub">
              {trace.model_calls_count} model calls &middot; {trace.tool_calls_count} tool calls
            </span>
          </div>
        </li>
        <li className="box-info-item">
          <div className="box-info-icon orange">
            <IconBinaryTree2 size={32} stroke={1.6} />
          </div>
          <div className="box-info-text">
            <h3>{trace.spans.length}</h3>
            <p>Spans</p>
            <span className="sub">{trace.agent_name}</span>
          </div>
        </li>
      </ul>
    </>
  );
}
