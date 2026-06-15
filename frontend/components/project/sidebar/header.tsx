"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ChevronsUpDown, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";

import NotificationTrigger from "@/components/notifications/notification-trigger";
import ProjectCreateDialog from "@/components/projects/project-create-dialog";
import WorkspaceCreateDialog from "@/components/projects/workspace-create-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import {
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar.tsx";
import { useFeatureFlags } from "@/contexts/feature-flags-context.tsx";
import { useProjectContext } from "@/contexts/project-context.tsx";
import { LAST_ID_COOKIE_MAX_AGE, LAST_PROJECT_ID, LAST_WORKSPACE_ID } from "@/lib/cookies";
import { Feature } from "@/lib/features/features";
import { useToast } from "@/lib/hooks/use-toast.ts";
import { cn, swrFetcher } from "@/lib/utils.ts";
import { type Project, type Workspace, WorkspaceTier } from "@/lib/workspaces/types.ts";

// Hierarchy left→right: [Workspaces] (parent) → [Projects in X] (child).
// dir < 0 = move left toward the parent (workspaces); dir > 0 = move right back to projects.
const slideVariants = {
  enter: (dir: number) => ({ x: dir < 0 ? "-100%" : "100%" }),
  center: { x: 0 },
  exit: (dir: number) => ({
    x: dir < 0 ? "100%" : "-100%",
    position: "absolute" as const,
    top: 0,
    left: 0,
    width: "100%",
  }),
};

const ProjectSidebarHeader = ({ projectId, workspaceId }: { workspaceId: string; projectId: string }) => {
  const { isMobile, openMobile, open } = useSidebar();
  const { projects, project } = useProjectContext();
  const { data: workspaces, error } = useSWR<Workspace[]>("/api/workspaces", swrFetcher);
  const { toast } = useToast();
  const featureFlags = useFeatureFlags();

  const [view, setView] = useState<"projects" | "workspaces">("projects");
  const [direction, setDirection] = useState(0);
  // The workspace currently being browsed in the picker — NOT necessarily the active one.
  // Picking a workspace only changes this; navigation happens when a project is clicked.
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(workspaceId);

  const isSelectedCurrent = selectedWorkspaceId === workspaceId;
  // Current workspace's projects are already in context; fetch others on demand.
  const { data: otherProjects, isLoading: otherLoading } = useSWR<Project[]>(
    isSelectedCurrent ? null : `/api/workspaces/${selectedWorkspaceId}/projects`,
    swrFetcher
  );
  const displayedProjects = isSelectedCurrent ? projects : (otherProjects ?? []);
  const selectedWorkspace = workspaces?.find((w) => w.id === selectedWorkspaceId);
  const selectedIsFreeTier = featureFlags[Feature.SUBSCRIPTION] && selectedWorkspace?.tierName === WorkspaceTier.FREE;

  useEffect(() => {
    if (error) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  }, [error, toast]);

  return (
    <SidebarHeader className="px-0 mt-2">
      <SidebarMenu>
        <SidebarMenuItem className="m-0 px-2 flex items-center">
          <div className="flex-1 overflow-hidden">
            <DropdownMenu
              onOpenChange={(o) => {
                // Reset to the active workspace's projects pane on every (re)open.
                if (!o) {
                  setDirection(0);
                  setView("projects");
                  setSelectedWorkspaceId(workspaceId);
                }
              }}
            >
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  className={cn("flex items-center justify-center px-1.5", { border: !open && !openMobile })}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {!open && !openMobile ? (
                      <motion.span
                        key="collapsed"
                        initial={{ opacity: 0, scale: 0.5, width: 0 }}
                        animate={{ opacity: 1, scale: 1, width: "auto" }}
                        exit={{ opacity: 0, scale: 0.5, width: 0 }}
                        transition={{ duration: 0.1 }}
                        className="flex items-center justify-center"
                      >
                        {project?.name?.at(0)?.toUpperCase()}
                      </motion.span>
                    ) : (
                      <motion.div
                        key="expanded"
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                        transition={{ duration: 0.1 }}
                        className="flex items-center w-full"
                      >
                        <span className="truncate font-medium leading-tight">{project?.name}</span>
                        <ChevronsUpDown className="ml-auto size-4 shrink-0 text-secondary-foreground" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-(--radix-dropdown-menu-trigger-width) min-w-64 rounded-lg text-xs bg-landing-surface-600"
                align="start"
                sideOffset={4}
                side={isMobile ? "bottom" : "right"}
              >
                {/* Project + workspace picking (horizontal swipe between panes) */}
                <div className="relative overflow-hidden">
                  <AnimatePresence initial={false} custom={direction}>
                    {view === "projects" ? (
                      <motion.div
                        key="projects"
                        custom={direction}
                        variants={slideVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{ duration: 0.18, ease: "easeInOut" }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setDirection(-1);
                            setView("workspaces");
                          }}
                          className="flex w-full items-center gap-1 rounded-sm p-1 text-secondary-foreground hover:bg-accent mb-1"
                        >
                          <ArrowLeft className="size-3 shrink-0" />
                          <span className="truncate">{selectedWorkspace ? selectedWorkspace.name : "Projects"}</span>
                        </button>
                        <div className="max-h-[600px] overflow-y-auto">
                          {!isSelectedCurrent && otherLoading ? (
                            <div className="p-1 text-muted-foreground">Loading…</div>
                          ) : (
                            displayedProjects.map((p) => (
                              <Link
                                key={p.id}
                                passHref
                                href={`/project/${p.id}/traces`}
                                // Write the breadcrumb cookies synchronously (no server action) so they
                                // can't race / interrupt the soft navigation — the bug this fixes.
                                onClick={() => {
                                  document.cookie = `${LAST_PROJECT_ID}=${p.id};path=/;max-age=${LAST_ID_COOKIE_MAX_AGE}`;
                                  document.cookie = `${LAST_WORKSPACE_ID}=${selectedWorkspaceId};path=/;max-age=${LAST_ID_COOKIE_MAX_AGE}`;
                                }}
                              >
                                <DropdownMenuItem
                                  className={cn("cursor-pointer", {
                                    "bg-accent": isSelectedCurrent && p.id === projectId,
                                  })}
                                >
                                  <span className="min-w-0 truncate text-xs text-sidebar-foreground font-medium">
                                    {p.name}
                                  </span>
                                </DropdownMenuItem>
                              </Link>
                            ))
                          )}
                        </div>
                        <DropdownMenuSeparator />
                        <ProjectCreateDialog
                          workspaceId={selectedWorkspaceId}
                          isFreeTier={selectedIsFreeTier}
                          projectCount={displayedProjects.length}
                        >
                          <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="cursor-pointer">
                            <Plus className="size-4" />
                            <span>Create project</span>
                          </DropdownMenuItem>
                        </ProjectCreateDialog>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="workspaces"
                        custom={direction}
                        variants={slideVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{ duration: 0.18, ease: "easeInOut" }}
                      >
                        <div className="pl-2 py-1 text-secondary-foreground mb-1">Workspaces</div>
                        <div className="max-h-[600px] overflow-y-auto">
                          {workspaces?.map((w) => (
                            <DropdownMenuItem
                              key={w.id}
                              onSelect={(e) => {
                                // Select within the picker only — slide back to this workspace's projects.
                                e.preventDefault();
                                setSelectedWorkspaceId(w.id);
                                setDirection(1);
                                setView("projects");
                              }}
                              className={cn("cursor-pointer", { "bg-accent": w.id === selectedWorkspaceId })}
                            >
                              <span className="min-w-0 flex-1 truncate text-xs text-sidebar-foreground font-medium">
                                {w.name}
                              </span>
                              <span
                                className={cn(
                                  "shrink-0 text-xs text-secondary-foreground py-0 px-1.5 rounded-md bg-secondary/40 font-mono border border-secondary-foreground/20",
                                  { "border-primary bg-primary/10 text-primary": w.tierName === "Pro" }
                                )}
                              >
                                {w.tierName}
                              </span>
                            </DropdownMenuItem>
                          ))}
                        </div>
                        <DropdownMenuSeparator />
                        <WorkspaceCreateDialog>
                          <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="cursor-pointer">
                            <Plus className="size-4" />
                            <span>Create workspace</span>
                          </DropdownMenuItem>
                        </WorkspaceCreateDialog>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {(open || openMobile) && <NotificationTrigger />}
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
  );
};

export default ProjectSidebarHeader;
