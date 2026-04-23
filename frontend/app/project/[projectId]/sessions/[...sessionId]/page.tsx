import Session from "@/components/traces/session";

export default async function SessionPage(props: { params: Promise<{ projectId: string; sessionId: string[] }> }) {
  const { sessionId } = await props.params;
  const decoded = sessionId.map((segment) => decodeURIComponent(segment)).join("/");
  return <Session sessionId={decoded} />;
}
