import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import PageViewTracker from "@/components/common/page-view-tracker";
import DebuggerSessionView from "@/components/debugger-sessions/debugger-session-view";
import { getSharedDebuggerSession } from "@/lib/actions/shared/debugger-sessions";

const getCachedSharedDebuggerSession = cache((sessionId: string) => getSharedDebuggerSession({ sessionId }));

export const generateMetadata = async (props: { params: Promise<{ sessionId: string }> }): Promise<Metadata> => {
  const { sessionId } = await props.params;
  try {
    const shared = await getCachedSharedDebuggerSession(sessionId);
    if (!shared) {
      return { title: "Shared Session" };
    }
    const name = shared.session.name ?? shared.session.id;
    const title = `${name} - Shared Session`;
    const description = `View the shared debugger session "${name}" on Laminar.`;
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "website",
        url: `https://laminar.sh/shared/debugger-sessions/${sessionId}`,
        images: { url: "/opengraph-image.png", alt: "Laminar", width: 1200, height: 630 },
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: { url: "/twitter-image.png", alt: "Laminar", width: 1200, height: 630 },
      },
    };
  } catch {
    return { title: "Shared Session" };
  }
};

export default async function SharedDebuggerSessionPage(props: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await props.params;

  const shared = await getCachedSharedDebuggerSession(sessionId);

  if (!shared) {
    return notFound();
  }

  const sessionName = shared.session.name ?? shared.session.id;
  const headerPath = [{ name: sessionName, copyValue: shared.session.id }];

  return (
    <>
      <PageViewTracker feature="shared" action="debugger_session_viewed" properties={{ sessionId }} />
      <DebuggerSessionView
        headerPath={headerPath}
        sessionId={shared.session.id}
        initialName={shared.session.name ?? null}
        isShared
        projectId={shared.projectId}
      />
    </>
  );
}
