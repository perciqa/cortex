"use client";
import dynamic from "next/dynamic";

const Graph = dynamic(() => import("./ProvenanceGraphInner"), { ssr: false });

export interface GraphArticle {
  id: string;
  type: string;
  content: string;
  trust_score?: number | null;
  cites?: string[];
}

export interface ProvenanceGraphProps { articles: GraphArticle[]; }

export function ProvenanceGraph(props: ProvenanceGraphProps) {
  return <Graph {...props} />;
}
