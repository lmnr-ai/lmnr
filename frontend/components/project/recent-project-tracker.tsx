"use client";

import { useEffect } from "react";

import { useUserContext } from "@/contexts/user-context";
import { recordRecentProject } from "@/lib/projects/recent";

type RecentProjectTrackerProps = {
  projectId: string;
  projectName: string;
  workspaceId: string;
  workspaceName: string;
};

// Stamps the current project into the per-user recent-projects MRU (localStorage).
// Mounted in the project layout so any navigation into a project counts as access.
const RecentProjectTracker = ({ projectId, projectName, workspaceId, workspaceName }: RecentProjectTrackerProps) => {
  const user = useUserContext();

  useEffect(() => {
    recordRecentProject(user.id, { id: projectId, name: projectName, workspaceId, workspaceName });
  }, [user.id, projectId, projectName, workspaceId, workspaceName]);

  return null;
};

export default RecentProjectTracker;
