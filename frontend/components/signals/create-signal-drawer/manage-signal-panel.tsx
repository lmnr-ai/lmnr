"use client";

import { Activity, Bell, History, Settings2 } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo } from "react";
import { FormProvider, useForm } from "react-hook-form";

import AlertsManager from "@/components/settings/alerts/alerts-manager";
import { SettingsSectionHeader } from "@/components/settings/settings-section";
import CreateSignalJob from "@/components/signal/create-signal-job";
import SignalRunsTable from "@/components/signal/runs-table";
import SlackConnectionCard from "@/components/slack/slack-connection-card";
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
import { useFeatureFlags } from "@/contexts/feature-flags-context";
import { useProjectContext } from "@/contexts/project-context";
import { useUserContext } from "@/contexts/user-context";
import { Feature } from "@/lib/features/features";
import { cn } from "@/lib/utils";

import ManageSignalContent from "./manage-signal-content";
import { getDefaultValues, type ManageSignalForm } from "./types";

interface Props {
  defaultValues?: ManageSignalForm;
  onSuccess?: (signal: ManageSignalForm) => Promise<void>;
  className?: string;
  slackClientId?: string;
  slackRedirectUri?: string;
  slackBrokerEnabled?: boolean;
}

type SignalTab = "settings" | "activity" | "backfill" | "alerts";

const tabs: { id: SignalTab; label: string; icon: ReactNode }[] = [
  { id: "settings", label: "General", icon: <Settings2 /> },
  { id: "alerts", label: "Alerts", icon: <Bell /> },
  { id: "backfill", label: "Backfill", icon: <History /> },
  { id: "activity", label: "Activity", icon: <Activity /> },
];

const tabHeaders: Record<SignalTab, { title: string; description?: string }> = {
  settings: {
    title: "General",
    description: "Configure this signal's definition and triggers.",
  },
  activity: {
    title: "Activity",
    description: "Runs produced when this signal is evaluated against incoming traces.",
  },
  backfill: {
    title: "Backfill",
  },
  alerts: {
    title: "Alerts",
    description: "Get notified in Slack or email whenever this signal produces new events.",
  },
};

const contentWidthClass = "max-w-4xl 2xl:max-w-6xl mx-auto";

const sidebarStyle = { "--sidebar-width": "auto" } as CSSProperties;

const isSignalTab = (value: string | null): value is SignalTab => tabs.some((tab) => tab.id === value);

export default function ManageSignalPanel({
  defaultValues: initialValues,
  onSuccess,
  className,
  slackClientId,
  slackRedirectUri,
  slackBrokerEnabled,
}: Props) {
  const { projectId } = useParams();
  const pathName = usePathname();
  const searchParams = useSearchParams();
  const featureFlags = useFeatureFlags();
  const defaultMode = featureFlags[Feature.BATCH_SIGNALS] ? 0 : 1;

  const { workspace } = useProjectContext();
  const { email: userEmail } = useUserContext();

  const sectionParam = searchParams.get("section");
  const activeTab: SignalTab = isSignalTab(sectionParam) ? sectionParam : "settings";

  const signalId = initialValues?.id;

  const previousTriggerIds = useMemo(
    () => (initialValues?.triggers ?? []).filter((t) => t.id).map((t) => t.id!),
    [initialValues]
  );

  const buildSectionHref = useCallback(
    (section: SignalTab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", "settings");
      params.set("section", section);
      return `${pathName}?${params.toString()}`;
    },
    [searchParams, pathName]
  );

  const convertToFormValues = useCallback(
    (values: ManageSignalForm | undefined): ManageSignalForm => {
      if (!values) return getDefaultValues(String(projectId), defaultMode);
      return values;
    },
    [projectId, defaultMode]
  );

  const form = useForm<ManageSignalForm>({
    defaultValues: convertToFormValues(initialValues),
    mode: "onChange",
  });

  // Re-sync form when the underlying signal changes (e.g. saved from elsewhere).
  useEffect(() => {
    form.reset(convertToFormValues(initialValues));
  }, [initialValues, form, convertToFormValues]);

  // After save, reset to the saved values so isDirty clears but the data stays on screen.
  const onSubmitComplete = useCallback(
    (data: ManageSignalForm) => {
      form.reset(data);
    },
    [form]
  );

  const renderContent = () => {
    switch (activeTab) {
      case "settings":
        return (
          <ScrollArea className="flex-1">
            <div className={cn(contentWidthClass, "w-full px-4 flex flex-col gap-4")}>
              <SettingsSectionHeader {...tabHeaders.settings} />
              <FormProvider {...form}>
                <ManageSignalContent
                  variant="panel"
                  onSuccess={onSuccess}
                  onSubmitComplete={onSubmitComplete}
                  previousTriggerIds={previousTriggerIds}
                />
              </FormProvider>
            </div>
          </ScrollArea>
        );
      case "activity":
        return (
          <div className={cn("flex flex-col flex-1 overflow-hidden w-full", contentWidthClass)}>
            <div className="px-4 pb-4">
              <SettingsSectionHeader {...tabHeaders.activity} />
            </div>
            <div className="flex flex-1 overflow-hidden px-4 pb-4">
              <SignalRunsTable />
            </div>
          </div>
        );
      case "backfill":
        return (
          <div className={cn("flex flex-col flex-1 overflow-hidden w-full", contentWidthClass)}>
            <div className="px-4">
              <SettingsSectionHeader {...tabHeaders.backfill} />
            </div>
            <CreateSignalJob />
          </div>
        );
      case "alerts":
        return (
          <ScrollArea className="flex-1">
            <div className={cn(contentWidthClass, "w-full px-4 flex flex-col gap-4")}>
              <SettingsSectionHeader {...tabHeaders.alerts} />
              <SlackConnectionCard
                workspaceId={workspace?.id ?? ""}
                slackClientId={slackClientId}
                slackRedirectUri={slackRedirectUri}
                brokerEnabled={slackBrokerEnabled}
                returnPath={`/project/${projectId}/signals/${signalId}?tab=settings&section=alerts`}
                disabled={!workspace}
              />
              {workspace && signalId ? (
                <AlertsManager
                  projectId={String(projectId)}
                  workspaceId={workspace.id}
                  userEmail={userEmail}
                  fixedSignalId={signalId}
                />
              ) : null}
            </div>
          </ScrollArea>
        );
    }
  };

  return (
    <SidebarProvider defaultOpen className="min-h-0 flex-1 overflow-hidden">
      <div className="flex flex-1 overflow-hidden" style={sidebarStyle}>
        <Sidebar collapsible="none" className="min-w-[160px]">
          <SidebarContent className="bg-background">
            <SidebarGroup className="px-4 py-0">
              <SidebarMenu>
                {tabs.map((tab) => (
                  <SidebarMenuItem className="h-7" key={tab.id}>
                    <SidebarMenuButton
                      asChild
                      className="flex items-center flex-1 hover:bg-surface-700 active:bg-surface-600 data-[active=true]:bg-surface-600"
                      isActive={activeTab === tab.id}
                      tooltip={tab.label}
                    >
                      <Link href={buildSectionHref(tab.id)}>
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
        <div className={cn("flex flex-col flex-1 overflow-hidden", className)}>{renderContent()}</div>
      </div>
    </SidebarProvider>
  );
}
