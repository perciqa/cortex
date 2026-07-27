import { useEffect, useReducer, useRef } from "react";

export interface MetricsSample {
  node: string;
  embeds_per_sec_radeon: number;
  embeds_per_sec_cpu: number;
  queries_per_sec_radeon: number;
  queries_per_sec_cpu: number;
  gpu_mem_util_pct: number;
  p95_query_latency_ms: number;
  gpu_device_name?: string;
  gpu_sensor_backend?: string;
  hip_version?: string;
  torch_version?: string;
  gpu_mem_util_total_mb?: number;
}

export interface MetricsState {
  byNode: Record<string, MetricsSample[]>;
  connected: boolean;
}

type MAction =
  | { type: "connected" }
  | { type: "disconnected" }
  | { type: "sample"; sample: MetricsSample };

function reducer(s: MetricsState, a: MAction): MetricsState {
  switch (a.type) {
    case "connected": return { ...s, connected: true };
    case "disconnected": return { ...s, connected: false };
    case "sample": {
      const list = [...(s.byNode[a.sample.node] ?? []), a.sample].slice(-60);
      return { ...s, byNode: { ...s.byNode, [a.sample.node]: list } };
    }
  }
}

export function useBrokerMetrics(url: string): MetricsState {
  const [state, dispatch] = useReducer(reducer, { byNode: {}, connected: false });
  const hasSamples = useRef(false);

  useEffect(() => {
    const ws = new WebSocket(url);
    ws.onopen = () => dispatch({ type: "connected" });
    ws.onclose = () => dispatch({ type: "disconnected" });
    ws.onmessage = (ev: MessageEvent) => {
      try {
        const env = JSON.parse(ev.data);
        if (env.type === "metrics") {
          dispatch({ type: "sample", sample: env.payload });
          hasSamples.current = true;
        }
      } catch { /* ignore */ }
    };
    return () => ws.close();
  }, [url]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const poll = async () => {
      if (hasSamples.current) return;
      try {
        const [rocmRes, llmRes] = await Promise.allSettled([
          fetch("/api/rocm-info").then(r => r.json()),
          fetch("/api/llm-info").then(r => r.json()),
        ]);

        if (cancelled) return;

        const rocm = rocmRes.status === "fulfilled" ? rocmRes.value : null;
        const llm = llmRes.status === "fulfilled" ? llmRes.value : null;

        if (rocm) {
          const sample: MetricsSample = {
            node: "soc-alpha",
            embeds_per_sec_radeon: 0,
            embeds_per_sec_cpu: 0,
            queries_per_sec_radeon: 0,
            queries_per_sec_cpu: 0,
            gpu_mem_util_pct: rocm.mem_util_pct || 0,
            p95_query_latency_ms: 0,
            gpu_device_name: rocm.device_name,
            gpu_sensor_backend: rocm.sensor_backend,
            hip_version: rocm.hip_version,
            torch_version: rocm.torch_version,
            gpu_mem_util_total_mb: 0,
          };
          dispatch({ type: "sample", sample });
          hasSamples.current = true;
        }
      } catch { /* ignore */ }
    };

    interval = setInterval(poll, 5000);
    poll();

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, []);

  return state;
}
