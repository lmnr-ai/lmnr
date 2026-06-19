"use client";

import { useParams } from "next/navigation";
import React from "react";

import { SessionView } from "@/components/traces/session-view";
import Header from "@/components/ui/header";

const Session = ({ sessionId }: { sessionId: string }) => {
  const { projectId } = useParams<{ projectId: string }>();

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
