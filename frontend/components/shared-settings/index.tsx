"use client";

import {
  Activity,
  ArrowLeft,
  Bell,
  Cloud,
  Code2,
  CreditCard,
  DollarSign,
  FileBarChart,
  FolderClosed,
  GitBranch,
  Key,
  type LucideIcon,
  Plus,
  Settings2,
  ShieldCheck,
  Sparkles,
  Unplug,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type CSSProperties, useMemo } from "react";
import useSWR from "swr";

import ProjectCreateDialog from "@/components/projects/project-create-dialog";
import WorkspaceCreateDialog from "@/components/projects/workspace-create-dialog";
import AgentVersions from "@/components/settings/agent-versions";
import AlertsSettings from "@/components/settings/alerts";
import CustomModelCosts from "@/components/settings/custom-model-costs";
import DeleteProject from "@/components/settings/delete-project";
import PiiRedaction from "@/components/settings/pii-redaction";
import ProjectApiKeys from "@/components/settings/project-api-keys";
import ProviderApiKeys from "@/components/settings/provider-api-keys";
import RenameProject from "@/components/settings/rename-project";
import RenderTemplates from "@/components/settings/render-templates";
import { SettingsSectionHeader } from "@/components/settings/settings-section";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Header from "@/components/ui/header";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import WorkspaceBilling from "@/components/workspace/billing";
import WorkspaceDeployment from "@/components/workspace/deployment-settings/workspace-deployment.tsx";
import WorkspaceReports from "@/components/workspace/reports";
import WorkspaceUsage from "@/components/workspace/usage";
import WorkspaceIntegrations from "@/components/workspace/workspace-integrations";
import WorkspaceSettings from "@/components/workspace/workspace-settings";
import WorkspaceUsers from "@/components/workspace/workspace-users";
import { useFeatureFlags } from "@/contexts/feature-flags-context";
import { useProjectContext } from "@/contexts/project-context";
import { type SubscriptionDetails, type UpcomingInvoiceInfo } from "@/lib/actions/checkout/types";
import { setLastProjectIdCookie } from "@/lib/actions/project/cookies";
import { type WorkspaceStats } from "@/lib/actions/usage/types";
import { setLastWorkspaceIdCookie } from "@/lib/actions/workspace/cookies";
import { type ProjectApiKey } from "@/lib/api-keys/types";
import { Feature } from "@/lib/features/features";
import { cn, swrFetcher } from "@/lib/utils";
import {
  type Workspace,
  type WorkspaceInvitation,
  type WorkspaceRole,
  WorkspaceTier,
  type WorkspaceWithOptionalUsers,
} from "@/lib/workspaces/types";

interface SharedSettingsProps {
  workspace: WorkspaceWithOptionalUsers;
  projectId: string;
  apiKeys: ProjectApiKey[];
  invitations: WorkspaceInvitation[];
  workspaceStats: WorkspaceStats | null;
  isOwner: boolean;
  currentUserRole: WorkspaceRole;
  subscription: SubscriptionDetails | null;
  upcomingInvoice: UpcomingInvoiceInfo | null;
  canManageBilling: boolean;
  slackClientId?: string;
  slackRedirectUri?: string;
  slackBrokerEnabled?: boolean;
}

type Section =
  | "usage"
  | "team"
  | "deployment"
  | "integrations"
  | "reports"
  | "billing"
  | "workspace-general"
  | "general"
  | "project-api-keys"
  | "provider-api-keys"
  | "model-costs"
  | "render-templates"
  | "agent-versions"
  | "security"
  | "alerts";

const sidebarStyle = { "--sidebar-width": "auto" } as CSSProperties;

const VALID_SECTIONS = new Set<Section>([
  "usage",
  "team",
  "deployment",
  "integrations",
  "reports",
  "billing",
  "workspace-general",
  "general",
  "project-api-keys",
  "provider-api-keys",
  "model-costs",
  "render-templates",
  "agent-versions",
  "security",
  "alerts",
]);

const SharedSettings = ({
  workspace,
  projectId,
  apiKeys,
  invitations,
  workspaceStats,
  isOwner,
  currentUserRole,
  subscription,
  upcomingInvoice,
  canManageBilling,
  slackClientId,
  slackRedirectUri,
  slackBrokerEnabled,
}: SharedSettingsProps) => {
  const searchParams = useSearchParams();
  const featureFlags = useFeatureFlags();
  const { projects } = useProjectContext();
  const workspaceId = workspace.id;

  const { data: workspaces } = useSWR<Workspace[]>("/api/workspaces", swrFetcher);

  const rawSection = searchParams.get("section") as Section | null;
  const activeSection: Section = rawSection && VALID_SECTIONS.has(rawSection) ? rawSection : "general";

  const sectionHref = (section: Section) => `/settings/${workspaceId}/${projectId}?section=${section}`;

  const workspaceMenus = useMemo(() => {
    const items: { label: string; section: Section; icon: LucideIcon }[] = [
      { label: "Usage", section: "usage", icon: Activity },
      { label: "Team", section: "team", icon: Users },
    ];
    if (featureFlags[Feature.DEPLOYMENT]) {
      items.push({ label: "Data residency", section: "deployment", icon: Cloud });
    }
    items.push({ label: "Integrations", section: "integrations", icon: Unplug });
    items.push({ label: "Reports", section: "reports", icon: FileBarChart });
    if (featureFlags[Feature.SUBSCRIPTION]) {
      items.push({ label: "Billing", section: "billing", icon: CreditCard });
    }
    if (isOwner) {
      items.push({ label: "General", section: "workspace-general", icon: Settings2 });
    }
    return items;
  }, [featureFlags, isOwner]);

  const projectMenus: { label: string; section: Section; icon: LucideIcon }[] = [
    { label: "General", section: "general", icon: Settings2 },
    { label: "Project API Keys", section: "project-api-keys", icon: Key },
    { label: "Model providers", section: "provider-api-keys", icon: Sparkles },
    { label: "Model costs", section: "model-costs", icon: DollarSign },
    { label: "Render templates", section: "render-templates", icon: Code2 },
    { label: "Agent versions", section: "agent-versions", icon: GitBranch },
    { label: "Security", section: "security", icon: ShieldCheck },
    { label: "Alerts", section: "alerts", icon: Bell },
  ];

  const currentProject = projects.find((p) => p.id === projectId);
  const isFreeTier = featureFlags[Feature.SUBSCRIPTION] && workspace.tierName === WorkspaceTier.FREE;

  const renderSection = () => {
    switch (activeSection) {
      // Workspace sections
      case "usage":
        return <WorkspaceUsage workspaceStats={workspaceStats} workspace={workspace} isOwner={isOwner} />;
      case "team":
        return (
          <WorkspaceUsers
            invitations={invitations}
            workspace={workspace}
            isOwner={isOwner}
            currentUserRole={currentUserRole}
          />
        );
      case "deployment":
        return <WorkspaceDeployment workspace={workspace} />;
      case "integrations":
        return (
          <WorkspaceIntegrations
            workspaceId={workspace.id}
            slackClientId={slackClientId}
            slackRedirectUri={slackRedirectUri}
            slackBrokerEnabled={slackBrokerEnabled}
          />
        );
      case "reports":
        return (
          <WorkspaceReports
            workspaceId={workspace.id}
            slackClientId={slackClientId}
            slackRedirectUri={slackRedirectUri}
          />
        );
      case "billing":
        return (
          <WorkspaceBilling
            workspace={workspace}
            isOwner={isOwner}
            canManageBilling={canManageBilling}
            subscription={subscription}
            upcomingInvoice={upcomingInvoice}
          />
        );
      case "workspace-general":
        return <WorkspaceSettings workspace={workspace} isOwner={isOwner} />;
      // Project sections
      case "general":
        return (
          <>
            <SettingsSectionHeader title="General" description="Manage your project settings and preferences" />
            <div className="flex flex-col gap-8">
              <RenameProject />
              <DeleteProject />
            </div>
          </>
        );
      case "security":
        return (
          <>
            <SettingsSectionHeader title="Security" description="Control how this project handles sensitive data." />
            <div className="flex flex-col gap-8">
              <PiiRedaction />
            </div>
          </>
        );
      case "project-api-keys":
        return <ProjectApiKeys apiKeys={apiKeys} />;
      case "provider-api-keys":
        return <ProviderApiKeys />;
      case "model-costs":
        return <CustomModelCosts />;
      case "render-templates":
        return <RenderTemplates />;
      case "agent-versions":
        return <AgentVersions />;
      case "alerts":
        return (
          <AlertsSettings
            projectId={projectId}
            workspaceId={workspaceId}
            slackClientId={slackClientId}
            slackRedirectUri={slackRedirectUri}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Header path="settings" />
      <SidebarProvider defaultOpen>
        <div className="flex flex-1 overflow-hidden" style={sidebarStyle}>
          <Sidebar collapsible="none">
            <SidebarContent className="bg-background">
              <SidebarGroup className="pt-2">
                <SidebarMenu>
                  <SidebarMenuItem className="h-7">
                    <SidebarMenuButton asChild className="flex items-center flex-1" tooltip="Back to platform">
                      <Link href={`/project/${projectId}/traces`}>
                        <ArrowLeft />
                        <span className="mr-2">Back to platform</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroup>

              <SidebarGroup className="pt-0">
                <div className="px-2 py-1 text-xs text-muted-foreground">Workspace settings</div>
                <SidebarMenu>
                  <SidebarMenuItem className="h-7">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <SidebarMenuButton className="flex items-center flex-1">
                          <FolderClosed />
                          <span className="mr-2 truncate">{workspace.name}</span>
                        </SidebarMenuButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" side="right" className="min-w-56 rounded-lg text-xs">
                        {workspaces?.map((w) => (
                          <Link key={w.id} passHref href={`/settings/${w.id}?section=${activeSection}`}>
                            <DropdownMenuItem
                              onSelect={() => setLastWorkspaceIdCookie(w.id)}
                              className={cn("cursor-pointer", { "bg-accent": w.id === workspaceId })}
                            >
                              <span className="text-xs text-sidebar-foreground font-medium truncate">{w.name}</span>
                            </DropdownMenuItem>
                          </Link>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </SidebarMenuItem>
                  {workspaceMenus.map((m) => (
                    <SidebarMenuItem className="h-7" key={m.section}>
                      <SidebarMenuButton
                        asChild
                        className="flex items-center flex-1"
                        isActive={activeSection === m.section}
                        tooltip={m.label}
                      >
                        <Link href={sectionHref(m.section)}>
                          <m.icon />
                          <span className="mr-2">{m.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroup>

              <SidebarGroup className="pt-0">
                <div className="px-2 py-1 text-xs text-muted-foreground">Project settings</div>
                <SidebarMenu>
                  <SidebarMenuItem className="h-7">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <SidebarMenuButton className="flex items-center flex-1">
                          <FolderClosed />
                          <span className="mr-2 truncate">{currentProject?.name ?? "Project"}</span>
                        </SidebarMenuButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" side="right" className="min-w-56 rounded-lg text-xs">
                        {projects.map((p) => (
                          <Link
                            key={p.id}
                            passHref
                            href={`/settings/${workspaceId}/${p.id}?section=general`}
                            onClick={() => setLastProjectIdCookie(p.id)}
                          >
                            <DropdownMenuItem className={cn("cursor-pointer", { "bg-accent": p.id === projectId })}>
                              <span className="text-xs text-sidebar-foreground font-medium truncate">{p.name}</span>
                            </DropdownMenuItem>
                          </Link>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="p-0">
                          <ProjectCreateDialogItem
                            workspaceId={workspaceId}
                            isFreeTier={isFreeTier}
                            projectCount={projects.length}
                          />
                        </DropdownMenuItem>
                        <WorkspaceCreateDialog>
                          <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                            <Plus size={16} />
                            <span className="text-xs">Create workspace</span>
                          </DropdownMenuItem>
                        </WorkspaceCreateDialog>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </SidebarMenuItem>
                  {projectMenus.map((m) => (
                    <SidebarMenuItem className="h-7" key={m.section}>
                      <SidebarMenuButton
                        asChild
                        className="flex items-center flex-1"
                        isActive={activeSection === m.section}
                        tooltip={m.label}
                      >
                        <Link href={sectionHref(m.section)}>
                          <m.icon />
                          <span className="mr-2">{m.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroup>
            </SidebarContent>
          </Sidebar>
          <ScrollArea className="flex-1">
            <div className="flex flex-col gap-8 max-w-6xl mx-auto px-4 py-8 pb-24">{renderSection()}</div>
          </ScrollArea>
        </div>
      </SidebarProvider>
    </div>
  );
};

// ProjectCreateDialog renders its own trigger Button; wrap it so it sits inside the dropdown item.
const ProjectCreateDialogItem = ({
  workspaceId,
  isFreeTier,
  projectCount,
}: {
  workspaceId: string;
  isFreeTier?: boolean;
  projectCount: number;
}) => (
  <div className="w-full px-1 py-0.5">
    <ProjectCreateDialog workspaceId={workspaceId} isFreeTier={isFreeTier} projectCount={projectCount} />
  </div>
);

export default SharedSettings;
