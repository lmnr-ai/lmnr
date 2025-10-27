"use client";

import React from "react";

import ProjectSidebarHeader from "@/components/project/sidebar/header.tsx";
import SidebarFooter from "@/components/projects/sidebar-footer.tsx";
import { Sidebar } from "@/components/ui/sidebar";
import { ProjectDetails } from "@/lib/actions/project";

import ProjectSidebarContent from "./content";

interface ProjectSidebarProps {
  details: ProjectDetails;
}

export default function ProjectSidebar({ details }: ProjectSidebarProps) {
  return (
    <Sidebar className="border-none" collapsible="icon">
      <ProjectSidebarHeader workspaceId={details.workspaceId} projectId={details.id} />
      <ProjectSidebarContent details={details} />
      <SidebarFooter />
    </Sidebar>
  );
}
