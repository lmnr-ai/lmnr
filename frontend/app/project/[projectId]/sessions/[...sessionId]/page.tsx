import Session from "@/components/traces/session";

export default async function SessionPage(props: { params: Promise<{ projectId: string; sessionId: string[] }> }) {
  const { sessionId } = await props.params;
  const decoded = sessionId.join("/");
  return <Session sessionId={decoded} />;
}
