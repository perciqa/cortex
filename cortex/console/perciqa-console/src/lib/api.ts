const BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

async function get<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  } catch {
    throw new Error(`Argus server unreachable at ${BASE} — is the server running?`);
  }
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
}

export interface TraceSummary {
  trace_id: string;
  agent_name: string;
  task: string | null;
  status: "ok" | "error" | "drift" | "timeout";
  start_time: string;
  end_time: string | null;
  duration_ms: number | null;
  total_tokens: number;
  total_cost_usd: number;
  local_tokens: number;
  cloud_tokens: number;
  model_calls_count: number;
  tool_calls_count: number;
  span_count: number;
  error_message: string | null;
  created_at: string;
}

export interface SpanRow {
  span_id: string;
  trace_id: string;
  parent_span_id: string | null;
  name: string;
  kind: string;
  status: string;
  start_time: string;
  end_time: string | null;
  duration_ms: number | null;
  model_name: string | null;
  model_provider: string | null;
  model_base_url: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  model_cost_usd: number | null;
  model_latency_ms: number | null;
  model_cached: number | null;
  tool_name: string | null;
  tool_args_json: unknown | null;
  tool_result_json: unknown | null;
  tool_error: string | null;
  tool_latency_ms: number | null;
  input_json: unknown | null;
  output_json: unknown | null;
  attributes_json: Record<string, unknown> | null;
  events_json: unknown[] | null;
  error_message: string | null;
  error_type: string | null;
}

export interface TraceDetail extends TraceSummary {
  spans: SpanRow[];
}

export interface TraceListResponse {
  traces: TraceSummary[];
  total: number;
  limit: number;
  offset: number;
}

export function listTraces(params?: {
  limit?: number;
  offset?: number;
  agent_name?: string;
  status?: string;
}) {
  const q = new URLSearchParams();
  if (params?.limit)      q.set("limit", String(params.limit));
  if (params?.offset)     q.set("offset", String(params.offset));
  if (params?.agent_name) q.set("agent_name", params.agent_name);
  if (params?.status)     q.set("status", params.status);
  return get<TraceListResponse>(`/traces?${q}`);
}

export async function getTrace(id: string) {
  const res = await fetch(`${BASE}/traces/${id}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET /traces/${id} → ${res.status}`);
  return res.json() as Promise<TraceDetail>;
}

export interface FinOpsPeriod {
  total_cost_usd: number;
  local_cost_usd: number;
  cloud_cost_usd: number;
  local_tokens: number;
  cloud_tokens: number;
  total_tokens: number;
  trace_count: number;
  avg_cost_per_trace: number;
  savings_usd: number;
}

export interface FinOpsSummary {
  today: FinOpsPeriod;
  this_week: FinOpsPeriod;
  all_time: FinOpsPeriod;
}

export interface TimeseriesPoint {
  date: string;
  total_cost_usd: number;
  local_tokens: number;
  cloud_tokens: number;
  trace_count: number;
}

export interface BreakdownResponse {
  by_agent: { agent_name: string; trace_count: number; total_cost_usd: number; local_tokens: number; cloud_tokens: number }[];
  by_model: { model_name: string; model_provider: string; call_count: number; prompt_tokens: number; completion_tokens: number; total_cost_usd: number }[];
}

export const getFinOpsSummary = () => get<FinOpsSummary>("/finops/summary");
export const getTimeseries    = (days = 7) => get<TimeseriesPoint[]>(`/finops/timeseries?days=${days}`);
export const getBreakdown     = () => get<BreakdownResponse>("/finops/breakdown");

export interface EvalSummary {
  eval_id: string;
  trace_id: string;
  overall_score: number;
  verdict: "pass" | "warn" | "fail";
  judge_model: string;
  explanation: string;
  evaluated_at: string;
  agent_name: string | null;
}

export interface EvalListResponse {
  evals: EvalSummary[];
  total: number;
  avg_score: number | null;
  pass_rate: number | null;
}

export interface ScorePoint {
  date: string;
  avg_score: number;
  eval_count: number;
  pass_count: number;
}

export const listEvals    = (limit = 50) => get<EvalListResponse>(`/evals?limit=${limit}`);
export const getEvalScores = (days = 7) => get<ScorePoint[]>(`/evals/scores?days=${days}`);
