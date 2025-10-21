"use client";

import { FileText, Key, Settings2, Sparkles } from "lucide-react";
import { CSSProperties, ReactNode, useMemo, useState } from "react";

import { useProjectContext } from "@/contexts/project-context.tsx";
import { ProjectApiKey } from "@/lib/api-keys/types";

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
import ProjectApiKeys from "./project-api-keys";
import ProviderApiKeys from "./provider-api-keys";
import RenameProject from "./rename-project";
import { SettingsSectionHeader } from "./settings-section";
import TraceSummarySettings from "./trace-summary-settings";

interface SettingsProps {
  apiKeys: ProjectApiKey[];
}

type SettingsTab = "general" | "project-api-keys" | "provider-api-keys" | "trace-summary";

const tabs: { id: SettingsTab; label: string; icon: ReactNode }[] = [
  { id: "general", label: "General", icon: <Settings2 /> },
  { id: "project-api-keys", label: "Project API Keys", icon: <Key /> },
  { id: "provider-api-keys", label: "Model Providers", icon: <Sparkles /> },
  { id: "trace-summary", label: "Trace Summary", icon: <FileText /> },
];

const sidebarStyle = { "--sidebar-width": "auto" } as CSSProperties;

export default function Settings({ apiKeys }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  const { workspace } = useProjectContext();

  const menuTabs = useMemo(() => {
    if (workspace?.tierName !== "Free") {
      return tabs;
    }
    return tabs.filter((t) => t.id !== "trace-summary");
  }, [workspace]);

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
      case "trace-summary":
        return <TraceSummarySettings />;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Header path="settings" />
      <SidebarProvider defaultOpen>
        <div className="flex flex-1 overflow-hidden" style={sidebarStyle}>
          <Sidebar collapsible="none">
            <SidebarContent className="bg-background">
              <SidebarGroup className="pt-2 px-0">
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
                        <div className="cursor-pointer">
                          {tab.icon}
                          <span className="mr-2">{tab.label}</span>
                        </div>
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
