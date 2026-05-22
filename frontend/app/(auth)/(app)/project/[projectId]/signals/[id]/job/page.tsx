import CreateSignalJob from "@/components/signal/create-signal-job";

export default async function CreateSignalJobPage(props: { searchParams: Promise<{ traceId?: string }> }) {
  const { traceId } = await props.searchParams;

  return <CreateSignalJob traceId={traceId} />;
}
