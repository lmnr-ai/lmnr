"use client";

import React from "react";

import SidebarFooter from "@/components/projects/sidebar-footer";
import { Sidebar } from "@/components/ui/sidebar";
import { WorkspaceSidebarContent } from "@/components/workspace/sidebar/content";
import WorkspaceSidebarHeader from "@/components/workspace/sidebar/header";
import { type WorkspaceWithOptionalUsers } from "@/lib/workspaces/types";

interface WorkspaceSidebarProps {
  workspace: WorkspaceWithOptionalUsers;
  isOwner: boolean;
  workspaceFeatureEnabled: boolean;
}

const WorkspaceSidebar = ({ workspace, isOwner, workspaceFeatureEnabled }: WorkspaceSidebarProps) => (
  <Sidebar className="border-none" collapsible="icon">
    <WorkspaceSidebarHeader workspace={workspace} />
    <WorkspaceSidebarContent
      tier={workspace.tierName}
      isOwner={isOwner}
      workspaceFeatureEnabled={workspaceFeatureEnabled}
    />
    <SidebarFooter />
  </Sidebar>
);

export default WorkspaceSidebar;
