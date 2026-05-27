export const REPORT_TYPE = {
  SIGNAL_EVENTS_SUMMARY: "SIGNAL_EVENTS_SUMMARY",
} as const;

export type ReportType = (typeof REPORT_TYPE)[keyof typeof REPORT_TYPE];

export const REPORT_TARGET_TYPE = {
  SLACK: "SLACK",
  EMAIL: "EMAIL",
} as const;

export type ReportTargetType = (typeof REPORT_TARGET_TYPE)[keyof typeof REPORT_TARGET_TYPE];

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

const DAY_NAMES_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_NAMES_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Backend stores `hour` as 0-23 UTC (scheduler.rs uses `t.hour()` on UTC `now`).
// We surface UTC explicitly so users don't misread the time in their local
// zone — and so labels stay stable across SSR / hydration.
export function formatReportTimeUTC(hour: number): string {
  return `${hour.toString().padStart(2, "0")}:00 UTC`;
}

export interface ReportDescription {
  title: string;
  schedule: string;
  detail: string;
}

// Backend stores weekday indices 0-6 with 0 = Monday
// (chrono `num_days_from_monday`), so a single [6] entry means Sunday.
export function getReportDescription({ weekdays, hour }: ReportSchedule): ReportDescription {
  const time = formatReportTimeUTC(hour);
  const sorted = [...weekdays].sort((a, b) => a - b);

  if (sorted.length === 0) {
    return { title: "Disabled", schedule: "Not scheduled", detail: "" };
  }
  if (sorted.length === 7) {
    return {
      title: "Daily digest",
      schedule: `Every day at ${time}`,
      detail: "A recap of the previous day's signals.",
    };
  }
  const isMonFri = sorted.length === 5 && [0, 1, 2, 3, 4].every((d) => sorted.includes(d));
  if (isMonFri) {
    return {
      title: "Daily summaries",
      schedule: `Mon – Fri at ${time}`,
      detail: "A recap of the previous weekday's signal events.",
    };
  }
  if (sorted.length === 1) {
    return {
      title: "Weekly summary",
      schedule: `Every ${DAY_NAMES_LONG[sorted[0]]} at ${time}`,
      detail: "A wrap-up of the entire past week's signal events.",
    };
  }
  return {
    title: "Custom schedule",
    schedule: `${sorted.map((d) => DAY_NAMES_SHORT[d]).join(", ")} at ${time}`,
    detail: "",
  };
}
