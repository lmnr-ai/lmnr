"use client";

import { useEffect } from "react";

import { group } from "@/lib/posthog";

interface WorkspaceGroupTrackerProps {
  workspaceId: string;
  workspaceName: string;
}

export default function WorkspaceGroupTracker({ workspaceId, workspaceName }: WorkspaceGroupTrackerProps) {
  useEffect(() => {
    group("workspace", workspaceName, { name: workspaceName, id: workspaceId });
  }, [workspaceName, workspaceId]);

  return null;
}
