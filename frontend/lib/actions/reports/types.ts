export const REPORT_TYPE = {
  SIGNAL_EVENTS_SUMMARY: "SIGNAL_EVENTS_SUMMARY",
} as const;

export type ReportType = (typeof REPORT_TYPE)[keyof typeof REPORT_TYPE];

export interface ReportSchedule {
  weekdays: number[];
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

export function getReportLabel(schedule: ReportSchedule): string {
  const daySet = new Set(schedule.weekdays);

  if (daySet.size === 7) return "Daily signals summary";

  const isWeekdays = daySet.size === 5 && [0, 1, 2, 3, 4].every((d) => daySet.has(d));
  if (isWeekdays) return "Weekday signals summary";

  if (daySet.size === 1) return "Weekly signals summary";

  return "Signals summary";
}
