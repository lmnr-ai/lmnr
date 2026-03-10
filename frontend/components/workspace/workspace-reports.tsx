"use client";

import { Calendar, Clock, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";

import { SettingsSection, SettingsSectionHeader } from "@/components/settings/settings-section";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useUserContext } from "@/contexts/user-context";
import { formatSchedule, type ReportWithDetails } from "@/lib/actions/reports/types";
import { useToast } from "@/lib/hooks/use-toast";
import { swrFetcher } from "@/lib/utils";

interface WorkspaceReportsProps {
  workspaceId: string;
}

export default function WorkspaceReports({ workspaceId }: WorkspaceReportsProps) {
  const { email } = useUserContext();
  const { toast } = useToast();

  const {
    data: reports,
    isLoading,
    mutate,
    error,
  } = useSWR<ReportWithDetails[]>(`/api/workspaces/${workspaceId}/reports`, swrFetcher);

  useEffect(() => {
    if (error) {
      toast({
        title: error instanceof Error ? error.message : "Failed to load reports.",
        variant: "destructive",
      });
    }
  }, [error, toast]);

  const [togglingReportId, setTogglingReportId] = useState<string | null>(null);

  const isSubscribed = useCallback(
    (report: ReportWithDetails) => report.targets.some((t) => t.type === "email" && t.email === email),
    [email]
  );

  const handleToggle = useCallback(
    async (report: ReportWithDetails, subscribe: boolean) => {
      setTogglingReportId(report.id);
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/reports`, {
          method: subscribe ? "POST" : "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reportId: report.id, email }),
        });

        if (!res.ok) {
          const error = (await res.json().catch(() => ({ error: "Failed to update" }))) as { error: string };
          throw new Error(error?.error ?? "Failed to update subscription");
        }

        toast({
          title: subscribe ? "Subscribed to report" : "Unsubscribed from report",
        });
        await mutate();
      } catch (e) {
        toast({
          title: "Error updating subscription",
          variant: "destructive",
          description: e instanceof Error ? e.message : "Failed to update subscription",
        });
      } finally {
        setTogglingReportId(null);
      }
    },
    [workspaceId, email, mutate, toast]
  );

  return (
    <>
      <SettingsSectionHeader title="Reports" description="Periodic reports delivered to your email." />
      <div className="flex flex-col gap-6">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && (!reports || reports.length === 0) && (
          <SettingsSection>
            <div className="flex flex-col items-center justify-center gap-2 py-12">
              <p className="text-sm text-muted-foreground">No reports available yet.</p>
              <p className="text-xs text-muted-foreground">
                Reports will appear here once they are configured for your workspace.
              </p>
            </div>
          </SettingsSection>
        )}

        {reports?.map((report) => {
          const subscribed = isSubscribed(report);
          const isToggling = togglingReportId === report.id;

          return (
            <SettingsSection key={report.id}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-2">
                  <h3 className="text-base font-semibold">{report.label}</h3>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="size-3.5" />
                      {report.schedule.weekday.length === 7
                        ? "Every day"
                        : report.schedule.weekday
                            .map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d])
                            .join(", ")}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="size-3.5" />
                      {formatSchedule(report.schedule)}
                    </span>
                  </div>
                  {subscribed && (
                    <p className="text-xs text-muted-foreground">
                      Reports will be sent to <span className="font-medium text-foreground">{email}</span>
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 pt-1">
                  {isToggling && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                  <Label htmlFor={`report-toggle-${report.id}`} className="text-sm">
                    {subscribed ? "Subscribed" : "Subscribe"}
                  </Label>
                  <Switch
                    id={`report-toggle-${report.id}`}
                    checked={subscribed}
                    disabled={isToggling}
                    onCheckedChange={(checked) => handleToggle(report, checked)}
                  />
                </div>
              </div>
            </SettingsSection>
          );
        })}
      </div>
    </>
  );
}
