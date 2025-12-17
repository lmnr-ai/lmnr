import { differenceInHours, differenceInMinutes, subHours } from "date-fns";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DateRange as ReactDateRange } from "react-day-picker";

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
  { name: "2 weeks", value: (24 * 7 * 2).toString() },
  { name: "1 month", value: (24 * 7 * 4).toString() },
];

export const getTimeDifference = (from: Date, to: Date): string => {
  const totalHours = differenceInHours(to, from);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = differenceInMinutes(to, from) % 60;

  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
};

export const useDateRangeState = () => {
  const searchParams = useSearchParams();
  const pastHours = searchParams.get("pastHours");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const [calendarDate, setCalendarDate] = useState<ReactDateRange | undefined>(undefined);
  const [startTime, setStartTime] = useState<string>("00:00");
  const [endTime, setEndTime] = useState<string>("00:00");

  const getDisplayRange = () => {
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

  useEffect(() => {
    if (startDate && endDate) {
      const urlFrom = new Date(startDate);
      const urlTo = new Date(endDate);
      setCalendarDate({ from: urlFrom, to: urlTo });

      const startHour = urlFrom.getHours().toString().padStart(2, "0");
      const startMinute = urlFrom.getMinutes().toString().padStart(2, "0");
      setStartTime(`${startHour}:${startMinute}`);

      const endHour = urlTo.getHours().toString().padStart(2, "0");
      const endMinute = urlTo.getMinutes().toString().padStart(2, "0");
      setEndTime(`${endHour}:${endMinute}`);
    } else if (pastHours) {
      setCalendarDate(undefined);
    }
  }, [startDate, endDate, pastHours]);

  return {
    pastHours,
    getDisplayRange,
    calendarDate,
    setCalendarDate,
    startTime,
    setStartTime,
    endTime,
    setEndTime,
  };
};
