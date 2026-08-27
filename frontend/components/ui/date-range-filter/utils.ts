import { differenceInHours, differenceInMinutes, subHours } from "date-fns";

export type DateRange = {
  name: string;
  value: string;
};

export const QUICK_RANGES: DateRange[] = [
  { name: "1 hour", value: "1" },
  { name: "3 hours", value: "3" },
  { name: "1 day", value: "24" },
  { name: "3 days", value: (24 * 3).toString() },
  { name: "1 week", value: (24 * 7).toString() },
  { name: "1 month", value: (24 * 30).toString() },
  { name: "3 months", value: (24 * 90).toString() },
  { name: "6 months", value: (24 * 30 * 6).toString() },
];

const RANGE_UNITS = [
  { singular: "hour", plural: "hours", aliases: ["h", "hr", "hrs", "hour", "hours"], hours: 1 },
  { singular: "day", plural: "days", aliases: ["d", "day", "days"], hours: 24 },
  { singular: "week", plural: "weeks", aliases: ["w", "wk", "wks", "week", "weeks"], hours: 24 * 7 },
  { singular: "month", plural: "months", aliases: ["m", "mo", "mos", "mon", "month", "months"], hours: 24 * 30 },
] as const;

const CUSTOM_RANGE_QUERY = /^(\d+)\s*([a-z]*)$/;

export const getSuggestedRanges = (query: string, presets: DateRange[] = QUICK_RANGES): DateRange[] => {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return presets;

  const parsed = trimmed.match(CUSTOM_RANGE_QUERY);
  if (parsed) {
    const amount = Number.parseInt(parsed[1], 10);
    if (!Number.isInteger(amount) || amount <= 0) return [];

    const unitQuery = parsed[2];
    const units = unitQuery
      ? RANGE_UNITS.filter((unit) => unit.aliases.some((alias) => alias.startsWith(unitQuery)))
      : RANGE_UNITS;

    return units.map((unit) => ({
      name: `${amount} ${amount === 1 ? unit.singular : unit.plural}`,
      value: String(amount * unit.hours),
    }));
  }

  return presets.filter((range) => range.name.toLowerCase().includes(trimmed));
};

export const getTimeDifference = (from: Date, to: Date): string => {
  const totalHours = differenceInHours(to, from);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = differenceInMinutes(to, from) % 60;

  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
};

export const getDisplayRange = ({
  startDate,
  endDate,
  pastHours,
}: {
  pastHours?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}) => {
  if (startDate && endDate) {
    return { from: new Date(startDate), to: new Date(endDate) };
  }
  if (pastHours) {
    const parsedHours = parseInt(pastHours);
    if (!isNaN(parsedHours)) {
      const to = new Date();
      const from = subHours(to, parsedHours);
      return { from, to };
    }
  }
  const to = new Date();
  const from = subHours(to, 24);
  return { from, to };
};
