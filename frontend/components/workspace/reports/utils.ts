import { type ReportSchedule } from "@/lib/actions/reports/types";

const ISO_SHORT_NAMES: Record<number, string> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
  7: "Sun",
};

const ISO_FULL_NAMES: Record<number, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

export function formatSchedule(schedule: ReportSchedule): string {
  const hour = schedule.hour;
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const timeStr = `${displayHour}:00 ${period} UTC`;

  const days = schedule.weekday;

  if (days.length === 0) return timeStr;

  if (days.length === 7) return `Every day at ${timeStr}`;

  const daySet = new Set(days);
  const isWeekdays = daySet.size === 5 && [1, 2, 3, 4, 5].every((d) => daySet.has(d));
  if (isWeekdays) return `Weekdays at ${timeStr}`;

  const isWeekends = daySet.size === 2 && daySet.has(6) && daySet.has(7);
  if (isWeekends) return `Weekends at ${timeStr}`;

  if (days.length === 1) {
    return `Every ${ISO_FULL_NAMES[days[0]] ?? `day ${days[0]}`} at ${timeStr}`;
  }

  const dayNames = days.map((d) => ISO_SHORT_NAMES[d] ?? `day ${d}`).join(", ");
  return `${dayNames} at ${timeStr}`;
}
