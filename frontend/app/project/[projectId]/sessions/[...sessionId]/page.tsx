import Session from "@/components/traces/session";

// Session IDs may contain URL-unsafe characters (e.g. Slack IDs like
// "slack:C0ATXMVNUH1:1777480932.750739"). The callers percent-encode each
// segment (see trace-view header and sessions table), but Next.js's
// catch-all param does not auto-decode, so we decode each segment here.
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
  return <Session sessionId={decoded} />;
}
