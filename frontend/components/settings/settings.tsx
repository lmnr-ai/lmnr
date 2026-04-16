"use client";

import { Bell, DollarSign, Key, Settings2, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { type CSSProperties, type ReactNode, useEffect, useState } from "react";

import { track } from "@/lib/analytics";
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
import AlertsSettings from "./alerts";
import CustomModelCosts from "./custom-model-costs";
import DeleteProject from "./delete-project";
import ProjectApiKeys from "./project-api-keys";
import ProviderApiKeys from "./provider-api-keys";
import RenameProject from "./rename-project";
import { SettingsSectionHeader } from "./settings-section";

interface SettingsProps {
  apiKeys: ProjectApiKey[];
  projectId: string;
  workspaceId: string;
  slackClientId?: string;
  slackRedirectUri?: string;
}

type SettingsTab = "general" | "project-api-keys" | "provider-api-keys" | "alerts" | "model-costs";

const tabs: { id: SettingsTab; label: string; icon: ReactNode }[] = [
  { id: "general", label: "General", icon: <Settings2 /> },
  { id: "project-api-keys", label: "Project API Keys", icon: <Key /> },
  { id: "provider-api-keys", label: "Model Providers", icon: <Sparkles /> },
  { id: "model-costs", label: "Model Costs", icon: <DollarSign /> },
  { id: "alerts", label: "Alerts", icon: <Bell /> },
];

const sidebarStyle = { "--sidebar-width": "auto" } as CSSProperties;

export default function Settings({ apiKeys, projectId, workspaceId, slackClientId, slackRedirectUri }: SettingsProps) {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<SettingsTab>((searchParams.get("tab") as SettingsTab) || "general");
  const pathName = usePathname();

  useEffect(() => {
    track("settings", "page_viewed", { tab: activeTab });
  }, []);

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
      case "model-costs":
        return <CustomModelCosts />;
      case "alerts":
        return (
          <AlertsSettings
            projectId={projectId}
            workspaceId={workspaceId}
            slackClientId={slackClientId}
            slackRedirectUri={slackRedirectUri}
          />
        );
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
                  {tabs.map((tab) => (
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
