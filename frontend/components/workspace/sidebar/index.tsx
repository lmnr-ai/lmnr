"use client";

import React, { type ReactNode } from "react";

import SidebarFooter from "@/components/projects/sidebar-footer";
import { Sidebar } from "@/components/ui/sidebar";
import { WorkspaceSidebarContent } from "@/components/workspace/sidebar/content";
import WorkspaceSidebarHeader from "@/components/workspace/sidebar/header";
import { type WorkspaceWithOptionalUsers } from "@/lib/workspaces/types";

interface WorkspaceSidebarProps {
  workspace: WorkspaceWithOptionalUsers;
  isOwner: boolean;
  versionBadge?: ReactNode;
}

const WorkspaceSidebar = ({ workspace, isOwner, versionBadge }: WorkspaceSidebarProps) => (
  <Sidebar className="border-none" collapsible="icon">
    <WorkspaceSidebarHeader workspace={workspace} />
    <WorkspaceSidebarContent tier={workspace.tierName} isOwner={isOwner} />
    <SidebarFooter versionBadge={versionBadge} />
  </Sidebar>
);

export default WorkspaceSidebar;
