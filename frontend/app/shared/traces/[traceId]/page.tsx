import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { cache } from "react";

import PageViewTracker from "@/components/common/page-view-tracker";
import TraceView from "@/components/shared/traces/trace-view";
import { getSharedSpans } from "@/lib/actions/shared/spans";
import { getSharedTrace, getSharedTraceRecord } from "@/lib/actions/shared/trace";
import { authOptions } from "@/lib/auth";
import { isUserMemberOfProject } from "@/lib/authorization";

const getCachedSharedTrace = cache((traceId: string) => getSharedTrace({ traceId }));

export const generateMetadata = async (props: { params: Promise<{ traceId: string }> }): Promise<Metadata> => {
  const { traceId } = await props.params;
  try {
    const trace = await getCachedSharedTrace(traceId);
    if (!trace || trace.visibility !== "public") {
      return { title: "Shared Trace" };
    }
    const startTime = new Date(trace.startTime).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
    const title = `Shared Trace - ${startTime}`;
    const typePart = trace.traceType ? `, ${trace.traceType} type` : "";
    const description = `Trace with ${trace.totalTokens.toLocaleString()} tokens${typePart}. View the full trace on Laminar.`;
    const ogImageUrl = `/shared/traces/${traceId}/opengraph-image`;
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "website",
        url: `https://laminar.sh/shared/traces/${traceId}`,
        images: [
          {
            url: ogImageUrl,
            width: 1200,
            height: 630,
            alt: title,
          },
        ],
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: [ogImageUrl],
      },
    };
  } catch {
    return { title: "Shared Trace" };
  }
};

export default async function SharedTracePage(props: {
  params: Promise<{ traceId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { traceId } = await props.params;

  // If the viewer is a member of the project that owns this trace, send them
  // to the authenticated viewer, which has the full feature set (session pill,
  // chat, signals, etc.). Logged-out viewers and non-members keep seeing the
  // public shared viewer. The PG lookup is cached per-request so getSharedTrace
  // below doesn't re-query for the same record.
  const sharedTrace = await getSharedTraceRecord(traceId);
  if (sharedTrace) {
    const session = await getServerSession(authOptions);
    if (session?.user?.id && (await isUserMemberOfProject(sharedTrace.projectId, session.user.id))) {
      redirect(`/project/${sharedTrace.projectId}/traces/${traceId}`);
    }
  }

  const trace = await getCachedSharedTrace(traceId);

  if (!trace || trace.visibility !== "public") {
    return notFound();
  }

  const spans = await getSharedSpans({ traceId }).catch(() => []);

  return (
    <>
      <PageViewTracker feature="shared" action="trace_viewed" properties={{ traceId }} />
      <TraceView trace={trace} spans={spans} />
    </>
  );
}
