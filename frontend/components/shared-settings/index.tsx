"use client";

import {
  Activity,
  Bell,
  Cloud,
  Code2,
  CreditCard,
  DollarSign,
  FileBarChart,
  GitBranch,
  Key,
  type LucideIcon,
  Settings2,
  ShieldCheck,
  Sparkles,
  Unplug,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

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
import { type SettingsSection } from "@/contexts/project-context";
import { type SubscriptionDetails, type UpcomingInvoiceInfo } from "@/lib/actions/checkout/types";
import { type WorkspaceStats } from "@/lib/actions/usage/types";
import { type ProjectApiKey } from "@/lib/api-keys/types";
import { Feature } from "@/lib/features/features";
import { type WorkspaceInvitation, type WorkspaceRole, type WorkspaceWithOptionalUsers } from "@/lib/workspaces/types";

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

type Section = SettingsSection;

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
  const workspaceId = workspace.id;

  // Billing / Data residency are feature-gated: hidden from the sidebar AND not renderable
  // via a direct ?tab= link when their flag is off.
  const isSectionEnabled = (section: Section): boolean => {
    if (section === "billing") return !!featureFlags[Feature.SUBSCRIPTION];
    if (section === "deployment") return !!featureFlags[Feature.DEPLOYMENT];
    return true;
  };

  const rawSection = searchParams.get("tab") as Section | null;
  const activeSection: Section = (() => {
    if (!rawSection || !VALID_SECTIONS.has(rawSection)) return "general";
    // A real but feature-disabled workspace section (billing/deployment off) lands on the
    // default workspace section, not the project General panel the URL never named.
    if (!isSectionEnabled(rawSection)) return "usage";
    return rawSection;
  })();

  const sectionHref = (section: Section) => `/project/${projectId}/settings?tab=${section}`;

  const workspaceMenus = useMemo(() => {
    const items: { label: string; section: Section; icon: LucideIcon }[] = [];
    if (isOwner) {
      items.push({ label: "General", section: "workspace-general", icon: Settings2 });
    }
    items.push({ label: "Usage", section: "usage", icon: Activity });
    items.push({ label: "Team", section: "team", icon: Users });
    if (featureFlags[Feature.DEPLOYMENT]) {
      items.push({ label: "Data residency", section: "deployment", icon: Cloud });
    }
    items.push({ label: "Integrations", section: "integrations", icon: Unplug });
    items.push({ label: "Reports", section: "reports", icon: FileBarChart });
    if (featureFlags[Feature.SUBSCRIPTION]) {
      items.push({ label: "Billing", section: "billing", icon: CreditCard });
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
    <div className="flex flex-col h-full gap-2">
      {/* Header is OUTSIDE the nested provider so its SidebarTrigger toggles the main project sidebar. */}
      <Header path="settings" />
      <SidebarProvider defaultOpen>
        <div className="flex flex-1 overflow-hidden">
          <Sidebar collapsible="none" className="w-64">
            <SidebarContent className="bg-background pl-2">
              <SidebarGroup className="pt-0">
                <div className="px-2 py-1 text-xs text-muted-foreground mb-1">Project settings</div>
                <SidebarMenu>
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

              <SidebarGroup className="pt-0">
                <div className="px-2 py-1 text-xs text-muted-foreground mb-1">Workspace settings</div>
                <SidebarMenu>
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
            </SidebarContent>
          </Sidebar>
          <ScrollArea className="flex-1">
            <div className="flex flex-col gap-8 max-w-3xl 3xl:max-w-4xl mx-auto px-4 pb-24">{renderSection()}</div>
          </ScrollArea>
        </div>
      </SidebarProvider>
    </div>
  );
};

export default SharedSettings;
