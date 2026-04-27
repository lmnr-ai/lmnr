"use client";

import { useParams } from "next/navigation";
import React, { useEffect } from "react";

import { SessionView } from "@/components/traces/session-view";
import Header from "@/components/ui/header";
import { track } from "@/lib/posthog";

const Session = ({ sessionId }: { sessionId: string }) => {
  const { projectId } = useParams<{ projectId: string }>();

  useEffect(() => {
    track("sessions", "session_page_viewed", { sessionId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <Header
        path={[
          { name: "sessions", href: `/project/${projectId}/traces?view=sessions` },
          { name: sessionId, copyValue: sessionId },
        ]}
        childrenContainerClassName="flex-none mr-2 h-12"
      />
      <div className="flex-none border-t" />
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <SessionView sessionId={sessionId} />
      </div>
    </>
  );
};

export default Session;
