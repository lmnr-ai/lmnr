import PageViewTracker from "@/components/common/page-view-tracker";
import Session from "@/components/traces/session";

export default async function SessionPage(props: { params: Promise<{ projectId: string; sessionId: string[] }> }) {
  const { sessionId } = await props.params;
  const decoded = sessionId.join("/");
  return (
    <>
      <PageViewTracker feature="sessions" properties={{ sessionId: decoded }} />
      <Session sessionId={decoded} />
    </>
  );
}
