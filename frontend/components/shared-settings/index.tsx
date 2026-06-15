"use client";

import {
  Activity,
  ArrowLeft,
  Bell,
  ChevronsUpDown,
  Cloud,
  Code2,
  CreditCard,
  DollarSign,
  FileBarChart,
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
import { useMemo } from "react";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
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

  // Billing / Data residency are feature-gated: hidden from the sidebar AND not renderable
  // via a direct ?section= or a legacy ?tab= redirect when their flag is off.
  const isSectionEnabled = (section: Section): boolean => {
    if (section === "billing") return !!featureFlags[Feature.SUBSCRIPTION];
    if (section === "deployment") return !!featureFlags[Feature.DEPLOYMENT];
    return true;
  };

  const rawSection = searchParams.get("section") as Section | null;
  const activeSection: Section = (() => {
    if (!rawSection || !VALID_SECTIONS.has(rawSection)) return "general";
    // A real but feature-disabled workspace section (billing/deployment off) lands on the
    // default workspace section, not the project General panel the URL never named.
    if (!isSectionEnabled(rawSection)) return "usage";
    return rawSection;
  })();

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
    <>
      <Sidebar collapsible="none" className="w-56">
        <SidebarContent>
          <SidebarGroup className="pt-2">
            <SidebarMenu>
              <SidebarMenuItem className="text-secondary-foreground">
                <SidebarMenuButton
                  asChild
                  className="flex items-center flex-1 text-xs text-muted-foreground"
                  tooltip="Back to platform"
                >
                  <Link href={`/project/${projectId}/traces`}>
                    <ArrowLeft className="size-3" />
                    <span className="mr-2">Back to platform</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>

          <SidebarGroup className="pt-0">
            <div className="px-2 py-1 text-xs text-muted-foreground mb-1">Workspace settings</div>
            <SidebarMenu>
              <SidebarMenuItem className="mb-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="flex items-center flex-1 bg-landing-surface-500 hover:bg-landing-surface-400 active:bg-landingtext-600 w-full justify-between h-9"
                    >
                      <span className="mr-2 truncate">{workspace.name}</span>
                      <ChevronsUpDown className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    side="bottom"
                    className="w-(--radix-dropdown-menu-trigger-width) rounded-lg text-xs bg-landing-surface-600"
                  >
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
                    <DropdownMenuSeparator />
                    <WorkspaceCreateDialog>
                      <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="cursor-pointer">
                        <Plus size={16} />
                        <span className="text-xs">Create workspace</span>
                      </DropdownMenuItem>
                    </WorkspaceCreateDialog>
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
            <div className="px-2 py-1 text-xs text-muted-foreground mb-1">Project settings</div>
            <SidebarMenu>
              <SidebarMenuItem className="mb-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="flex items-center flex-1 bg-landing-surface-500 hover:bg-landing-surface-400 active:bg-landingtext-600 w-full justify-between h-9"
                    >
                      <span className="mr-2 truncate">{currentProject?.name ?? "Project"}</span>
                      <ChevronsUpDown className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    side="bottom"
                    className="w-(--radix-dropdown-menu-trigger-width) rounded-lg text-xs bg-landing-surface-600"
                  >
                    {projects.map((p) => (
                      <Link
                        key={p.id}
                        passHref
                        href={`/settings/${workspaceId}/${p.id}?section=${activeSection}`}
                        onClick={() => setLastProjectIdCookie(p.id)}
                      >
                        <DropdownMenuItem className={cn("cursor-pointer", { "bg-accent": p.id === projectId })}>
                          <span className="text-xs text-sidebar-foreground font-medium truncate">{p.name}</span>
                        </DropdownMenuItem>
                      </Link>
                    ))}
                    <DropdownMenuSeparator />
                    <ProjectCreateDialog
                      workspaceId={workspaceId}
                      isFreeTier={isFreeTier}
                      projectCount={projects.length}
                    >
                      <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="cursor-pointer">
                        <Plus size={16} />
                        <span className="text-xs">Create project</span>
                      </DropdownMenuItem>
                    </ProjectCreateDialog>
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
      <SidebarInset className="relative flex flex-col h-[calc(100%-8px)]! border-l border-t flex-1 md:rounded-tl-lg overflow-hidden">
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-8 max-w-3xl mx-auto px-4 pt-16 pb-24">{renderSection()}</div>
        </ScrollArea>
      </SidebarInset>
    </>
  );
};

export default SharedSettings;
