"use client";
import { useEffect, useRef } from "react";
import { Network } from "vis-network";
import { DataSet } from "vis-data";
import type { GraphArticle } from "./ProvenanceGraph";

export interface ProvenanceGraphInnerProps { articles: GraphArticle[]; }

function colorFromTrust(t: number): string {
  if (t >= 0.7) return "#16a34a";
  if (t >= 0.4) return "#eab308";
  return "#dc2626";
}

export default function ProvenanceGraphInner({ articles }: ProvenanceGraphInnerProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const nodes = new DataSet(articles.map(a => ({
      id: a.id,
      label: a.content.slice(0, 24),
      color: { background: colorFromTrust(a.trust_score ?? 0.5) },
    })));
    let edgeIdx = 0;
    const edges = articles.flatMap(a =>
      (a.cites ?? []).map(to => ({ id: `e${edgeIdx++}`, from: a.id, to }))
    );
    new Network(ref.current, { nodes, edges: new DataSet(edges) }, { physics: { stabilization: true } });
  }, [articles]);
  return <div ref={ref} className="provenance-wrap" />;
}
