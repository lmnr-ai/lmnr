"use client";

import { Key, Settings2, Sparkles, Unplug } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { type CSSProperties, type ReactNode, useMemo, useState } from "react";

import { useProjectContext } from "@/contexts/project-context.tsx";
import { type ProjectApiKey } from "@/lib/api-keys/types";

import Header from "../ui/header";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "../ui/sidebar";
import DeleteProject from "./delete-project";
import Integrations from "./integrations";
import ProjectApiKeys from "./project-api-keys";
import ProviderApiKeys from "./provider-api-keys";
import RenameProject from "./rename-project";
import { SettingsSectionHeader } from "./settings-section";

interface SettingsProps {
  apiKeys: ProjectApiKey[];
  isSlackEnabled: boolean;
  slackClientId?: string;
  slackRedirectUri?: string;
}

type SettingsTab = "general" | "project-api-keys" | "provider-api-keys" | "integrations";

const tabs: { id: SettingsTab; label: string; icon: ReactNode }[] = [
  { id: "general", label: "General", icon: <Settings2 /> },
  { id: "project-api-keys", label: "Project API Keys", icon: <Key /> },
  { id: "provider-api-keys", label: "Model Providers", icon: <Sparkles /> },
  { id: "integrations", label: "Integrations", icon: <Unplug /> },
];

const sidebarStyle = { "--sidebar-width": "auto" } as CSSProperties;

export default function Settings({ apiKeys, isSlackEnabled, slackClientId, slackRedirectUri }: SettingsProps) {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<SettingsTab>((searchParams.get("tab") as SettingsTab) || "general");
  const pathName = usePathname();

  const { workspace } = useProjectContext();

  const menuTabs = useMemo(
    () => tabs.filter((t) => !(t.id === "integrations" && (workspace?.tierName !== "Pro" || !isSlackEnabled))),
    [workspace, isSlackEnabled]
  );

  const renderContent = () => {
    switch (activeTab) {
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
      case "project-api-keys":
        return <ProjectApiKeys apiKeys={apiKeys} />;
      case "provider-api-keys":
        return <ProviderApiKeys />;
      case "integrations":
        if (workspace?.tierName === "Pro" && isSlackEnabled) {
          return <Integrations slackClientId={slackClientId} slackRedirectUri={slackRedirectUri} />;
        }
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
                  {menuTabs.map((tab) => (
                    <SidebarMenuItem className="h-7" key={tab.id}>
                      <SidebarMenuButton
                        asChild
                        className="flex items-center flex-1"
                        isActive={activeTab === tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        tooltip={tab.label}
                      >
                        <Link href={`${pathName}?tab=${tab.id}`}>
                          {tab.icon}
                          <span className="mr-2">{tab.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroup>
            </SidebarContent>
          </Sidebar>
          <div className="flex-1 overflow-y-auto">
            <div className="flex flex-col gap-8 max-w-4xl mx-auto px-4">{renderContent()}</div>
          </div>
        </div>
      </SidebarProvider>
    </div>
  );
}
