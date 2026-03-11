export const REPORT_TYPE = {
  WEEKLY_SIGNALS_SUMMARY: "WEEKLY_SIGNALS_SUMMARY",
  DAILY_SIGNALS_SUMMARY: "DAILY_SIGNALS_SUMMARY",
} as const;

export type ReportType = (typeof REPORT_TYPE)[keyof typeof REPORT_TYPE];

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  WEEKLY_SIGNALS_SUMMARY: "Weekly signals summary",
  DAILY_SIGNALS_SUMMARY: "Weekdays signals summary",
};

export interface ReportSchedule {
  weekday: number[];
  hour: number;
}

export interface ReportTargetRow {
  id: string;
  type: string;
  email: string | null;
  channelId: string | null;
  channelName: string | null;
}

export interface ReportWithDetails {
  id: string;
  reportType: ReportType;
  label: string;
  workspaceId: string;
  createdAt: string;
  schedule: ReportSchedule;
  targets: ReportTargetRow[];
}
