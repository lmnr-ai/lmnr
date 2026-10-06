"use client";

import React from "react";

import ProjectSidebarHeader from "@/components/project/sidebar/header.tsx";
import SidebarFooter from "@/components/projects/sidebar-footer.tsx";
import { Sidebar } from "@/components/ui/sidebar";
import { type ProjectDetails } from "@/lib/actions/project";
import { type Announcement } from "@/lib/announcements/types";

import ProjectSidebarContent from "./content";

interface ProjectSidebarProps {
  dismissedAnnouncementIds: string[];
  details: ProjectDetails;
  announcements: Announcement[];
}

export default function ProjectSidebar({ dismissedAnnouncementIds, details, announcements }: ProjectSidebarProps) {
  return (
    <Sidebar className="border-none" collapsible="icon">
      <ProjectSidebarHeader workspaceId={details.workspaceId} projectId={details.id} />
      <ProjectSidebarContent
        announcements={announcements}
        details={details}
        dismissedAnnouncementIds={dismissedAnnouncementIds}
      />
      <SidebarFooter />
    </Sidebar>
  );
}
