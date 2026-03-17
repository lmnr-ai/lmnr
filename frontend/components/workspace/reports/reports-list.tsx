"use client";

import { Clock, Loader2, Mail } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { type ReportWithDetails } from "@/lib/actions/reports/types";
import { cn } from "@/lib/utils";

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
          <div
            key={report.id}
            className={cn(
              "flex items-center justify-between gap-4 px-4 py-3 transition-colors",
              subscribed && "bg-secondary/30"
            )}
          >
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{report.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-normal text-xs gap-1 text-secondary-foreground">
                  <Clock className="size-3" />
                  {formatSchedule(report.schedule)}
                </Badge>
                {subscribed && (
                  <span className="flex items-center gap-1 text-xs text-secondary-foreground">
                    <Mail className="size-3" />
                    {email}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isToggling && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
              <Label
                htmlFor={`report-toggle-${report.id}`}
                className="text-xs text-secondary-foreground cursor-pointer"
              >
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
