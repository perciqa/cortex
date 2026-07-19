"use client";

import { IconChevronRight, IconChevronDown } from "@tabler/icons-react";
import { Tooltip } from "@mantine/core";
import type { SpanRow } from "@/lib/api";
import { fmtMs, fmtTokens, fmtCost } from "@/lib/format";

const KIND_CLASS: Record<string, string> = {
  agent: "agent",
  model_call: "model_call",
  tool_call: "tool_call",
  internal: "internal",
  guardrail: "guardrail",
};

interface WaterfallRowProps {
  span: SpanRow;
  depth: number;
  maxDurationMs: number;
  hasChildren: boolean;
  expanded: boolean;
  onToggle: () => void;
  onSelect: () => void;
  selected: boolean;
}

export function WaterfallRow({
  span,
  depth,
  maxDurationMs,
  hasChildren,
  expanded,
  onToggle,
  onSelect,
  selected,
}: WaterfallRowProps) {
  const cls = KIND_CLASS[span.kind] ?? "internal";
  const pct = maxDurationMs > 0 ? Math.max(2, ((span.duration_ms ?? 0) / maxDurationMs) * 100) : 0;
  const tokens =
    span.completion_tokens != null && span.prompt_tokens != null
      ? span.completion_tokens + span.prompt_tokens
      : span.completion_tokens ?? span.prompt_tokens;
  const isError = span.status === "error";

  return (
    <tr
      className={`wf-row wf-depth-${depth} ${isError ? "wf-row-error" : ""} ${selected ? "wf-row-selected" : ""}`}
      onClick={onSelect}
    >
      <td style={{ paddingLeft: depth * 24 + 8 }}>
        <div className="wf-name-cell">
          {hasChildren ? (
            <button
              className="wf-chevron"
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              aria-label={expanded ? "Collapse" : "Expand"}
            >
              {expanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
            </button>
          ) : (
            <span className="wf-chevron-spacer" />
          )}
          <div className={`span-kind-dot ${cls}`} />
          <Tooltip label={span.name} disabled={span.name.length < 40} position="top-start" offset={8}>
            <span className="wf-span-name">{span.name}</span>
          </Tooltip>
          {span.model_name && <span className="wf-sub-badge model">{span.model_name}</span>}
          {span.tool_name && <span className="wf-sub-badge tool">{span.tool_name}</span>}
          {isError && (
            <Tooltip label={span.error_message ?? "Error"} disabled={!span.error_message} position="top" offset={8}>
              <span className="wf-sub-badge error">error</span>
            </Tooltip>
          )}
          <div className="wf-bar-wrap">
            <div
              className={`span-duration-bar ${cls}`}
              style={{ width: `${pct}%` }}
              title={`${fmtMs(span.duration_ms)}`}
            />
          </div>
        </div>
      </td>
      <td className="mono wf-num">{fmtMs(span.duration_ms)}</td>
      <td className="mono wf-num">
        {tokens != null ? fmtTokens(tokens) : "—"}
      </td>
      <td className="mono wf-num">
        {span.model_cost_usd != null && span.model_cost_usd > 0
          ? fmtCost(span.model_cost_usd)
          : "—"}
      </td>
    </tr>
  );
}
