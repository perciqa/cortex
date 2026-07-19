"use client";

import { useMemo } from "react";
import { Text } from "@mantine/core";
import type { SpanRow } from "@/lib/api";
import { WaterfallRow } from "./WaterfallRow";

interface RenderNode {
  span: SpanRow;
  depth: number;
  hasChildren: boolean;
}

function flattenTree(spans: SpanRow[], collapsedIds: Set<string>): RenderNode[] {
  const childrenMap: Record<string, SpanRow[]> = {};
  spans.forEach((s) => {
    const pid = s.parent_span_id ?? "__root__";
    if (!childrenMap[pid]) childrenMap[pid] = [];
    childrenMap[pid].push(s);
  });

  Object.values(childrenMap).forEach((list) =>
    list.sort(
      (a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    )
  );

  const result: RenderNode[] = [];

  function walk(parentId: string, depth: number) {
    const kids = childrenMap[parentId] ?? [];
    kids.forEach((span) => {
      const hasKids = (childrenMap[span.span_id]?.length ?? 0) > 0;
      result.push({ span, depth, hasChildren: hasKids });
      if (!collapsedIds.has(span.span_id)) {
        walk(span.span_id, depth + 1);
      }
    });
  }

  walk("__root__", 0);
  return result;
}

interface WaterfallTreeProps {
  spans: SpanRow[];
  collapsedIds: Set<string>;
  onToggleCollapse: (spanId: string) => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  selectedSpanId: string | null;
  onSelectSpan: (span: SpanRow) => void;
}

export function WaterfallTree({
  spans,
  collapsedIds,
  onToggleCollapse,
  onCollapseAll,
  onExpandAll,
  selectedSpanId,
  onSelectSpan,
}: WaterfallTreeProps) {
  const maxDurationMs = useMemo(
    () => Math.max(...spans.map((s) => s.duration_ms ?? 0), 1),
    [spans]
  );

  const nodes = useMemo(
    () => flattenTree(spans, collapsedIds),
    [spans, collapsedIds]
  );

  if (spans.length === 0) {
    return (
      <Text size="sm" c="dimmed" ta="center" className="wf-empty">
        No spans recorded for this trace.
      </Text>
    );
  }

  return (
    <>
      <div className="wf-toolbar">
        <button className="wf-toolbar-btn" onClick={onExpandAll}>
          Expand All
        </button>
        <button className="wf-toolbar-btn" onClick={onCollapseAll}>
          Collapse All
        </button>
      </div>

      <table className="wf-table">
        <thead>
          <tr>
            <th>Span</th>
            <th>Duration</th>
            <th>Tokens</th>
            <th>Cost</th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((node) => (
            <WaterfallRow
              key={node.span.span_id}
              span={node.span}
              depth={node.depth}
              maxDurationMs={maxDurationMs}
              hasChildren={node.hasChildren}
              expanded={!collapsedIds.has(node.span.span_id)}
              onToggle={() => onToggleCollapse(node.span.span_id)}
              onSelect={() => onSelectSpan(node.span)}
              selected={selectedSpanId === node.span.span_id}
            />
          ))}
        </tbody>
      </table>
    </>
  );
}
