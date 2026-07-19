"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader, Text, Alert } from "@mantine/core";
import { IconAlertCircle, IconRefresh } from "@tabler/icons-react";
import { getTrace, type TraceDetail } from "@/lib/api";
import { useArgusWebSocket, type WsEvent } from "@/hooks/useArgusWebSocket";
import type { SpanRow } from "@/lib/api";
import { TraceHeader } from "./components/TraceHeader";
import { WaterfallTree } from "./components/WaterfallTree";
import { SpanDetailPanel } from "./components/SpanDetailPanel";

export function TraceDetailClient({ traceId }: { traceId: string }) {
  const [trace, setTrace] = useState<TraceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSpan, setSelectedSpan] = useState<SpanRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [evalResult, setEvalResult] = useState<{
    overall_score: number;
    verdict: string;
  } | null>(null);

  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    getTrace(traceId)
      .then(setTrace)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [traceId, retryCount]);

  const handleRetry = useCallback(() => {
    setLoading(true);
    setError(null);
    setRetryCount((n) => n + 1);
  }, []);

  useArgusWebSocket(
    useCallback(
      (event: WsEvent) => {
        if (event.event === "eval_complete") {
          const d = event.data as {
            trace_id?: string;
            overall_score?: number;
            verdict?: string;
          };
          if (d.trace_id === traceId) {
            setEvalResult({
              overall_score: d.overall_score ?? 0,
              verdict: d.verdict ?? "",
            });
          }
        }
      },
      [traceId]
    )
  );

  const handleSelectSpan = (span: SpanRow) => {
    setSelectedSpan(span);
    setDetailOpen(true);
  };

  const handleToggleCollapse = (spanId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(spanId)) {
        next.delete(spanId);
      } else {
        next.add(spanId);
      }
      return next;
    });
  };

  const handleCollapseAll = () => {
    if (!trace) return;
    setCollapsedIds(new Set(trace.spans.map((s) => s.span_id)));
  };

  const handleExpandAll = () => {
    setCollapsedIds(new Set());
  };

  if (loading) {
    return (
      <div style={{ padding: 80, display: "flex", justifyContent: "center" }}>
        <Loader size="sm" color="blue" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "40px 0" }}>
        <Alert
          variant="light"
          color="red"
          title="Failed to load trace"
          icon={<IconAlertCircle size={16} />}
          style={{ marginBottom: 16 }}
        >
          {error}
        </Alert>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button
            className="wf-toolbar-btn"
            onClick={handleRetry}
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <IconRefresh size={14} /> Retry
          </button>
          <Link
            href="/argus/traces"
            className="wf-toolbar-btn"
            style={{ textDecoration: "none" }}
          >
            Back to Traces
          </Link>
        </div>
      </div>
    );
  }

  if (!trace) {
    return (
      <div style={{ padding: "80px 0", textAlign: "center" }}>
        <Text size="lg" fw={600} c="var(--dark)">
          Trace not found
        </Text>
        <Text size="sm" c="dimmed" mt={8} mb={20}>
          The trace may have been deleted or the ID is incorrect.
        </Text>
        <Link
          href="/argus/traces"
          className="wf-toolbar-btn"
          style={{ textDecoration: "none" }}
        >
          Back to Traces
        </Link>
      </div>
    );
  }

  return (
    <>
      <TraceHeader trace={trace} evalResult={evalResult} />

      <div className="table-data">
        <div className="panel-block" style={{ flexGrow: 1 }}>
          <div className="panel-block-head">
            <h3>Spans ({trace.spans.length})</h3>
          </div>

          <WaterfallTree
            spans={trace.spans}
            collapsedIds={collapsedIds}
            onToggleCollapse={handleToggleCollapse}
            onCollapseAll={handleCollapseAll}
            onExpandAll={handleExpandAll}
            selectedSpanId={selectedSpan?.span_id ?? null}
            onSelectSpan={handleSelectSpan}
          />
        </div>
      </div>

      <SpanDetailPanel
        span={selectedSpan}
        opened={detailOpen}
        onClose={() => setDetailOpen(false)}
      />
    </>
  );
}
