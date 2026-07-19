import { TraceDetailClient } from "./TraceDetailClient";

export default async function TraceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TraceDetailClient traceId={id} />;
}
