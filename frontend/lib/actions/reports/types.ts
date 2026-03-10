export const REPORT_TYPE = {
  WEEKLY_SIGNALS_SUMMARY: "WEEKLY_SIGNALS_SUMMARY",
  DAILY_SIGNALS_SUMMARY: "DAILY_SIGNALS_SUMMARY",
} as const;

export type ReportType = (typeof REPORT_TYPE)[keyof typeof REPORT_TYPE];

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  WEEKLY_SIGNALS_SUMMARY: "Weekly signals summary",
  DAILY_SIGNALS_SUMMARY: "Daily signals summary",
};

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

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

export function formatSchedule(schedule: ReportSchedule): string {
  const dayNames = schedule.weekday.map((d) => WEEKDAY_NAMES[d]).join(", ");
  const hour = schedule.hour;
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${dayNames} at ${displayHour}:00 ${period} UTC`;
}

export function reportTypeLabel(type: ReportType): string {
  return REPORT_TYPE_LABELS[type] ?? type;
}
