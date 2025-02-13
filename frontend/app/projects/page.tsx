import { Metadata } from "next";

import Projects from "@/components/projects/projects";
import WorkspacesNavbar from "@/components/projects/workspaces-navbar";
import Header from "@/components/ui/header";

export const metadata: Metadata = {
  title: "Projects",
};

export default async function ProjectsPage() {
  return (
    <>
      <WorkspacesNavbar />
      <div className="flex flex-col flex-grow min-h-screen ml-64 overflow-auto">
        <Header path="Projects" showSidebarTrigger={false} />
        <Projects />
      </div>
    </>
  );
}
