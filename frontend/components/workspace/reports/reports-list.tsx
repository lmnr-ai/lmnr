"use client";

import { Clock, Loader2 } from "lucide-react";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { type ReportWithDetails } from "@/lib/actions/reports/types";

import { formatSchedule } from "./utils";

interface ReportsListProps {
  reports: ReportWithDetails[];
  isLoading: boolean;
  email: string;
  togglingReportId: string | null;
  isSubscribed: (report: ReportWithDetails) => boolean;
  onToggle: (report: ReportWithDetails, subscribe: boolean) => void;
}

export default function ReportsList({
  reports,
  isLoading,
  email,
  togglingReportId,
  isSubscribed,
  onToggle,
}: ReportsListProps) {
  if (isLoading) {
    return (
      <div className="border rounded-md">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="border rounded-md">
        <div className="flex flex-col items-center justify-center gap-2 py-12">
          <p className="text-sm text-muted-foreground">No reports available yet.</p>
          <p className="text-xs text-muted-foreground">
            Reports will appear here once they are configured for your workspace.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded-md divide-y">
      {reports.map((report) => {
        const subscribed = isSubscribed(report);
        const isToggling = togglingReportId === report.id;

        return (
          <div key={report.id} className="flex items-start justify-between gap-4 p-4">
            <div className="flex flex-col gap-2">
              <h3 className="font-semibold">{report.label}</h3>
              <span className="flex items-center gap-1 text-xs text-secondary-foreground">
                <Clock className="size-3.5" />
                {formatSchedule(report.schedule)}
              </span>
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
                onCheckedChange={(checked) => onToggle(report, checked)}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
