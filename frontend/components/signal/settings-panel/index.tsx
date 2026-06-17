"use client";

import { Activity, Bell, History, Settings2 } from "lucide-react";
import { type CSSProperties, type ReactNode, useState } from "react";

import CreateSignalJob from "@/components/signal/create-signal-job";
import SignalRunsTable from "@/components/signal/runs-table";
import SignalAlerts from "@/components/signal/settings-panel/signal-alerts";
import { useSignalStoreContext } from "@/components/signal/store.tsx";
import { type ManageSignalForm, ManageSignalPanel } from "@/components/signals/create-signal-drawer";
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

type SettingsSection = "settings" | "activity" | "backfill" | "alerts";

const sections: { id: SettingsSection; label: string; icon: ReactNode }[] = [
  { id: "settings", label: "Settings", icon: <Settings2 /> },
  { id: "activity", label: "Activity", icon: <Activity /> },
  { id: "backfill", label: "Backfill", icon: <History /> },
  { id: "alerts", label: "Alerts", icon: <Bell /> },
];

const sidebarStyle = { "--sidebar-width": "auto" } as CSSProperties;

interface SignalSettingsPanelProps {
  projectId: string;
  workspaceId: string;
  onSuccess: (form: ManageSignalForm) => Promise<void>;
  slackClientId?: string;
  slackRedirectUri?: string;
}

export default function SignalSettingsPanel({
  projectId,
  workspaceId,
  onSuccess,
  slackClientId,
  slackRedirectUri,
}: SignalSettingsPanelProps) {
  const signal = useSignalStoreContext((state) => state.signal);
  const [activeSection, setActiveSection] = useState<SettingsSection>("settings");

  return (
    <SidebarProvider defaultOpen>
      <div className="flex flex-1 overflow-hidden" style={sidebarStyle}>
        <Sidebar collapsible="none">
          <SidebarContent className="bg-background">
            <SidebarGroup className="pt-2">
              <SidebarMenu>
                {sections.map((section) => (
                  <SidebarMenuItem className="h-7" key={section.id}>
                    <SidebarMenuButton
                      className="flex items-center flex-1"
                      isActive={activeSection === section.id}
                      onClick={() => setActiveSection(section.id)}
                      tooltip={section.label}
                    >
                      {section.icon}
                      <span className="mr-2">{section.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
        {activeSection === "settings" && (
          <ScrollArea className="flex-1">
            <ManageSignalPanel
              key={signal.id}
              defaultValues={signal}
              onSuccess={onSuccess}
              scrollAreaClassName="max-w-[900px] mx-auto pt-[36px]"
            />
          </ScrollArea>
        )}
        {activeSection === "activity" && (
          <div className="flex flex-col flex-1 overflow-hidden p-4">
            <SignalRunsTable />
          </div>
        )}
        {activeSection === "backfill" && (
          <div className="flex flex-col flex-1 overflow-hidden">
            <CreateSignalJob />
          </div>
        )}
        {activeSection === "alerts" && (
          <ScrollArea className="flex-1">
            <div className="max-w-4xl mx-auto px-4 py-6">
              <SignalAlerts
                projectId={projectId}
                workspaceId={workspaceId}
                signal={{ id: signal.id, name: signal.name }}
                slackClientId={slackClientId}
                slackRedirectUri={slackRedirectUri}
              />
            </div>
          </ScrollArea>
        )}
      </div>
    </SidebarProvider>
  );
}
