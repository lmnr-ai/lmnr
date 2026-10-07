import PageViewTracker from "@/components/common/page-view-tracker";
import Session from "@/components/traces/session";

const safeDecode = (segment: string) => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

export default async function SessionPage(props: { params: Promise<{ projectId: string; sessionId: string[] }> }) {
  const { sessionId } = await props.params;
  const decoded = sessionId.map(safeDecode).join("/");
  return (
    <>
      <PageViewTracker feature="sessions" properties={{ sessionId: decoded }} />
      <Session sessionId={decoded} />
    </>
  );
}
