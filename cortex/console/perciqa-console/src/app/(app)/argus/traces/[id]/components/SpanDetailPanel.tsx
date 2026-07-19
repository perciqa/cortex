"use client";

import { Drawer, Group, Text } from "@mantine/core";
import type { SpanRow } from "@/lib/api";
import { fmtMs, fmtTokens, fmtCost } from "@/lib/format";

interface SpanDetailPanelProps {
  span: SpanRow | null;
  opened: boolean;
  onClose: () => void;
}

type DetailRow = {
  label: string;
  value: string;
  mono?: boolean;
};

function collectDetails(span: SpanRow): DetailRow[] {
  const rows: DetailRow[] = [];

  rows.push({ label: "Span ID", value: span.span_id, mono: true });
  rows.push({ label: "Kind", value: span.kind.replace("_", " ") });
  rows.push({ label: "Status", value: span.status });

  if (span.start_time) {
    rows.push({
      label: "Start",
      value: new Date(span.start_time).toLocaleTimeString(),
      mono: true,
    });
  }
  if (span.end_time) {
    rows.push({
      label: "End",
      value: new Date(span.end_time).toLocaleTimeString(),
      mono: true,
    });
  }
  rows.push({ label: "Duration", value: fmtMs(span.duration_ms), mono: true });

  if (span.model_name) {
    rows.push({ label: "Model", value: span.model_name });
    if (span.model_provider) rows.push({ label: "Provider", value: span.model_provider });
    if (span.prompt_tokens != null) rows.push({ label: "Prompt Tokens", value: fmtTokens(span.prompt_tokens), mono: true });
    if (span.completion_tokens != null) rows.push({ label: "Completion Tokens", value: fmtTokens(span.completion_tokens), mono: true });
    if (span.model_cost_usd != null) rows.push({ label: "Cost", value: fmtCost(span.model_cost_usd), mono: true });
    if (span.model_latency_ms != null) rows.push({ label: "Model Latency", value: fmtMs(span.model_latency_ms), mono: true });
    if (span.model_cached != null) rows.push({ label: "Cached", value: span.model_cached === 1 ? "Yes" : "No" });
  }

  if (span.tool_name) {
    rows.push({ label: "Tool", value: span.tool_name });
    if (span.tool_error) rows.push({ label: "Tool Error", value: span.tool_error });
    if (span.tool_latency_ms != null) rows.push({ label: "Tool Latency", value: fmtMs(span.tool_latency_ms), mono: true });
  }

  if (span.error_message) {
    rows.push({ label: "Error", value: span.error_message });
  }
  if (span.error_type) {
    rows.push({ label: "Error Type", value: span.error_type });
  }

  return rows;
}

function DetailItem({ label, value, mono }: DetailRow) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "7px 0",
        borderBottom: "1px solid var(--grey)",
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--dark-grey)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 13,
          fontWeight: 500,
          fontFamily: mono ? "var(--font-mono)" : undefined,
          maxWidth: "60%",
          textAlign: "right",
          wordBreak: "break-all",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function JsonBlock({ label, data }: { label: string; data: unknown }) {
  const json =
    typeof data === "string"
      ? data
      : JSON.stringify(data, null, 2);

  return (
    <div style={{ marginTop: 16 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--dark-grey)",
          marginBottom: 6,
          display: "block",
        }}
      >
        {label}
      </span>
      <pre
        style={{
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          background: "var(--grey)",
          borderRadius: 8,
          padding: "10px 14px",
          overflow: "auto",
          maxHeight: 300,
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
          margin: 0,
        }}
      >
        {json}
      </pre>
    </div>
  );
}

export function SpanDetailPanel({ span, opened, onClose }: SpanDetailPanelProps) {
  if (!span) return null;

  const details = collectDetails(span);
  const showInput  = span.input_json != null;
  const showOutput = span.output_json != null;
  const showToolArgs = span.tool_args_json != null;
  const showToolResult = span.tool_result_json != null;
  const showAttributes = span.attributes_json != null && Object.keys(span.attributes_json).length > 0;
  const showEvents = span.events_json != null && (span.events_json as unknown[]).length > 0;

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <Text fw={700} size="sm" ff="var(--poppins)">
            {span.name}
          </Text>
          <span
            className="status-badge"
            style={{
              background:
                span.status === "ok"
                  ? "var(--blue)"
                  : span.status === "error"
                    ? "var(--red)"
                    : "var(--dark-grey)",
            }}
          >
            {span.status}
          </span>
        </Group>
      }
      position="right"
      size="lg"
      styles={{
        header: { borderBottom: "1px solid var(--grey)", paddingBottom: 12 },
        body: { paddingTop: 16, paddingLeft: 20, paddingRight: 20 },
      }}
    >
      <div style={{ fontFamily: "var(--poppins)" }}>
        {details.map((d) => (
          <DetailItem key={d.label} {...d} />
        ))}

        {showInput && <JsonBlock label="Input" data={span.input_json} />}
        {showOutput && <JsonBlock label="Output" data={span.output_json} />}
        {showToolArgs && <JsonBlock label="Tool Arguments" data={span.tool_args_json} />}
        {showToolResult && <JsonBlock label="Tool Result" data={span.tool_result_json} />}
        {showAttributes && <JsonBlock label="Attributes" data={span.attributes_json} />}
        {showEvents && <JsonBlock label="Events" data={span.events_json} />}
      </div>
    </Drawer>
  );
}
