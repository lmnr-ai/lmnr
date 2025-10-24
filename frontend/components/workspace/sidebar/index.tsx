"use client";

import React from "react";

import SidebarFooter from "@/components/projects/sidebar-footer";
import { Sidebar } from "@/components/ui/sidebar.tsx";
import WorkspaceSidebarContent from "@/components/workspace/sidebar/content.tsx";
import WorkspaceSidebarHeader from "@/components/workspace/sidebar/header.tsx";
import { WorkspaceWithOptionalUsers } from "@/lib/workspaces/types.ts";

const WorkspaceSidebar = ({ workspace, isOwner }: { workspace: WorkspaceWithOptionalUsers; isOwner: boolean }) => (
  <Sidebar className="border-none" collapsible="icon">
    <WorkspaceSidebarHeader workspace={workspace} />
    <WorkspaceSidebarContent isOwner={isOwner} />
    <SidebarFooter />
  </Sidebar>
);

export default WorkspaceSidebar;
