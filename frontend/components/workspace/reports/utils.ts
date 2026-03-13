import { type ReportSchedule } from "@/lib/actions/reports/types";

const SHORT_NAMES: Record<number, string> = {
  0: "Mon",
  1: "Tue",
  2: "Wed",
  3: "Thu",
  4: "Fri",
  5: "Sat",
  6: "Sun",
};

const FULL_NAMES: Record<number, string> = {
  0: "Monday",
  1: "Tuesday",
  2: "Wednesday",
  3: "Thursday",
  4: "Friday",
  5: "Saturday",
  6: "Sunday",
};

export function formatSchedule(schedule: ReportSchedule): string {
  const hour = schedule.hour;
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const timeStr = `${displayHour}:00 ${period} UTC`;

  const days = schedule.weekdays;

  if (days.length === 0) return timeStr;

  if (days.length === 7) return `Every day at ${timeStr}`;

  const daySet = new Set(days);
  const isWeekdays = daySet.size === 5 && [0, 1, 2, 3, 4].every((d) => daySet.has(d));
  if (isWeekdays) return `Weekdays at ${timeStr}`;

  const isWeekends = daySet.size === 2 && daySet.has(5) && daySet.has(6);
  if (isWeekends) return `Weekends at ${timeStr}`;

  if (days.length === 1) {
    return `Every ${FULL_NAMES[days[0]] ?? `day ${days[0]}`} at ${timeStr}`;
  }

  const dayNames = days.map((d) => SHORT_NAMES[d] ?? `day ${d}`).join(", ");
  return `${dayNames} at ${timeStr}`;
}
