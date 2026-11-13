"use client";

import { Bell, GitBranch, History, ListChecks, Settings2 } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { type ReactNode, useCallback, useEffect } from "react";
import { FormProvider, useForm } from "react-hook-form";

import AlertsManager from "@/components/settings/alerts/alerts-manager";
import { SettingsSectionHeader } from "@/components/settings/settings-section";
import CreateSignalJob from "@/components/signal/create-signal-job";
import { signalSectionHref } from "@/components/signal/hooks/signal-tab-search";
import SignalRunsTable from "@/components/signal/runs-table";
import VersionsSection from "@/components/signal/versions-section";
import SlackConnectionCard, { useSlackIntegration } from "@/components/slack/slack-connection-card";
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

import DeleteSignalSection from "./delete-signal-section";
import ManageSignalContent from "./manage-signal-content";
import { getDefaultValues, type ManageSignalForm } from "./types";

interface Props {
  defaultValues?: ManageSignalForm;
  onSuccess?: (signal: ManageSignalForm) => Promise<void>;
  className?: string;
  /** Applied inside each tab's scroll area, so top spacing scrolls with the content. */
  contentClassName?: string;
  slackClientId?: string;
  slackRedirectUri?: string;
  slackBrokerEnabled?: boolean;
  /** Above the section list, e.g. the signal page's tabs. */
  sidebarHeader?: ReactNode;
}

type SignalTab = "settings" | "runs" | "versions" | "backfill" | "alerts";

const tabs: { id: SignalTab; label: string; icon: ReactNode }[] = [
  { id: "settings", label: "Settings", icon: <Settings2 /> },
  { id: "runs", label: "Runs", icon: <ListChecks /> },
  { id: "versions", label: "Versions", icon: <GitBranch /> },
  { id: "alerts", label: "Alerts", icon: <Bell /> },
  { id: "backfill", label: "Backfill", icon: <History /> },
];

const tabHeaders: Record<SignalTab, { title: string; description?: string }> = {
  settings: {
    title: "Settings",
    description: "Configure this signal's definition and triggers.",
  },
  runs: {
    title: "Runs",
    description: "",
  },
  versions: {
    title: "Versions",
    description: "Track changes to your Signal definition, schema, and settings",
  },
  backfill: {
    title: "Backfill",
  },
  alerts: {
    title: "Alerts",
    description: "Get notified in Slack or email whenever this signal produces new events.",
  },
};

// Sections about an existing signal; the create drawer has none yet.
const NEEDS_SIGNAL = new Set<SignalTab>(["runs", "versions"]);

// Project settings is max-w-3xl (768px); signal forms (schema rows, prompt) get a little more room.
const contentWidthClass = "max-w-[796px] 3xl:max-w-[924px] mx-auto";

const isSignalTab = (value: string | null): value is SignalTab => tabs.some((tab) => tab.id === value);

export default function ManageSignalPanel({
  defaultValues: initialValues,
  onSuccess,
  className,
  contentClassName,
  slackClientId,
  slackRedirectUri,
  slackBrokerEnabled,
  sidebarHeader,
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
  // The connect card is only for connecting; once Slack is connected it has nothing to offer here.
  const { data: slack } = useSlackIntegration(workspace?.id ?? "", activeTab === "alerts" && !!workspace);

  const signalId = initialValues?.id;

  const buildSectionHref = useCallback(
    (section: SignalTab) => signalSectionHref(pathName, searchParams.toString(), section),
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
          <ScrollArea className="flex-1" viewportClassName="scroll-fade-t scroll-fade-t-3">
            <div className={cn(contentWidthClass, "w-full px-4 pb-32 flex flex-col gap-4", contentClassName)}>
              <SettingsSectionHeader {...tabHeaders.settings} />
              <FormProvider {...form}>
                <ManageSignalContent variant="panel" onSuccess={onSuccess} onSubmitComplete={onSubmitComplete} />
              </FormProvider>
              {signalId && (
                <DeleteSignalSection
                  projectId={String(projectId)}
                  signalId={signalId}
                  signalName={initialValues?.name ?? "signal"}
                />
              )}
            </div>
          </ScrollArea>
        );
      case "runs":
        return (
          <div className={cn("flex w-full flex-1 flex-col overflow-hidden", contentWidthClass, contentClassName)}>
            <div className="px-4 pb-4">
              <SettingsSectionHeader {...tabHeaders.runs} />
            </div>
            <SignalRunsTable />
          </div>
        );
      case "versions":
        return (
          <ScrollArea className="flex-1" viewportClassName="scroll-fade-t scroll-fade-t-3">
            <div className={cn(contentWidthClass, "w-full px-4 pb-32 flex flex-col gap-4", contentClassName)}>
              <SettingsSectionHeader {...tabHeaders.versions} />
              <VersionsSection />
            </div>
          </ScrollArea>
        );
      case "backfill":
        return (
          <div className={cn("flex flex-col flex-1 overflow-hidden w-full", contentWidthClass, contentClassName)}>
            <div className="px-4">
              <SettingsSectionHeader {...tabHeaders.backfill} />
            </div>
            <CreateSignalJob />
          </div>
        );
      case "alerts":
        return (
          <ScrollArea className="flex-1" viewportClassName="scroll-fade-t scroll-fade-t-3">
            <div className={cn(contentWidthClass, "w-full px-4 pb-32 flex flex-col gap-4", contentClassName)}>
              <SettingsSectionHeader {...tabHeaders.alerts} />
              {slack === null && (
                <SlackConnectionCard
                  workspaceId={workspace?.id ?? ""}
                  slackClientId={slackClientId}
                  slackRedirectUri={slackRedirectUri}
                  brokerEnabled={slackBrokerEnabled}
                  returnPath={`/project/${projectId}/signals/${signalId}?tab=settings&section=alerts`}
                  disabled={!workspace}
                />
              )}
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
    <SidebarProvider defaultOpen className={cn("min-h-0 flex-1 overflow-hidden", !sidebarHeader && "pt-2")}>
      <div className="flex flex-1 overflow-hidden">
        <Sidebar collapsible="none" className="w-52">
          <SidebarContent className="bg-background pl-2">
            {sidebarHeader && <div className="px-2 pt-[11px] pb-3">{sidebarHeader}</div>}
            <SidebarGroup className="pt-0">
              <SidebarMenu className="gap-0.5">
                {tabs
                  .filter((tab) => !NEEDS_SIGNAL.has(tab.id) || signalId)
                  .map((tab) => (
                    <SidebarMenuItem className="h-7" key={tab.id}>
                      <SidebarMenuButton
                        asChild
                        className="flex h-7 items-center flex-1 hover:overlay-hover active:overlay-selected data-[active=true]:overlay-selected"
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
