"use client";

import { differenceInHours, differenceInMinutes, formatDate, subHours, subYears } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, CalendarIcon, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DateRange as ReactDateRange } from "react-day-picker";

import { Badge } from "@/components/ui/badge.tsx";
import { cn } from "@/lib/utils";

import { Button } from "./button";
import { Calendar, CalendarProps } from "./calendar";
import { Label } from "./label";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

type DateRange = {
  name: string;
  value: string;
};

const RANGES: DateRange[] = [
  {
    name: "1h",
    value: "1",
  },
  {
    name: "24h",
    value: "24",
  },
  {
    name: "7d",
    value: (24 * 7).toString(),
  },
  {
    name: "30d",
    value: (24 * 30).toString(),
  },
  {
    name: "All",
    value: "all",
  },
];

function AbsoluteDateRangeFilter({
  disabled = { after: new Date(), before: subYears(new Date(), 1) },
}: {
  disabled?: CalendarProps["disabled"];
}) {
  const searchParams = new URLSearchParams(useSearchParams().toString());
  const pathName = usePathname();
  const router = useRouter();
  const pastHours = searchParams.get("pastHours");
  const [calendarDate, setCalendarDate] = useState<ReactDateRange | undefined>(undefined);
  const [startTime, setStartTime] = useState({ hour: "00", minute: "00" });
  const [endTime, setEndTime] = useState({ hour: "00", minute: "00" });

  useEffect(() => {
    let urlFrom: Date | undefined = undefined;
    try {
      const param = searchParams.get("startDate");
      if (param != undefined) {
        urlFrom = new Date(searchParams.get("startDate") as string);
        setStartTime({
          hour: urlFrom.getHours().toString().padStart(2, "0"),
          minute: urlFrom.getMinutes().toString().padStart(2, "0"),
        });
      }
    } catch (e) {}

    let urlTo: Date | undefined = undefined;
    try {
      const param = searchParams.get("endDate");
      if (param != undefined) {
        urlTo = new Date(searchParams.get("endDate") as string);
        setEndTime({
          hour: urlTo.getHours().toString().padStart(2, "0"),
          minute: urlTo.getMinutes().toString().padStart(2, "0"),
        });
      }
    } catch (e) {}

    if (calendarDate === undefined || urlFrom === undefined || urlTo === undefined) {
      setCalendarDate({
        from: urlFrom,
        to: urlTo,
      });
    }
  }, [pastHours]);

  useEffect(() => {
    if (calendarDate?.from) {
      const from = new Date(calendarDate.from);
      from.setHours(parseInt(startTime.hour));
      from.setMinutes(parseInt(startTime.minute));

      const newRange: ReactDateRange = { from };

      if (calendarDate.to) {
        const to = new Date(calendarDate.to);
        to.setHours(parseInt(endTime.hour));
        to.setMinutes(parseInt(endTime.minute));
        newRange.to = to;
      }

      setCalendarDate(newRange);
    }
  }, [startTime, endTime]);

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  // Generate hours and minutes for select options
  const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0"));
  const minutes = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, "0"));

  return (
    <div className={cn("grid gap-2")}>
      <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant="ghost"
            className={cn("justify-start text-left flex items-center font-normal text-xs text-white")}
          >
            {calendarDate?.from ? (
              <div className="pb-0.5">
                {calendarDate.to ? (
                  <>
                    {formatDate(calendarDate.from, "LLL dd, y HH:mm")} -{" "}
                    {formatDate(calendarDate.to, "LLL dd, y HH:mm")}
                  </>
                ) : (
                  formatDate(calendarDate?.from, "LLL dd, y HH:mm")
                )}
              </div>
            ) : (
              <div className="flex space-x-2 items-center text-secondary-foreground pb-0.5">
                <CalendarIcon size={14} /> <span>Custom</span>
              </div>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            defaultMonth={calendarDate?.from}
            selected={calendarDate}
            onSelect={setCalendarDate}
            numberOfMonths={2}
            disabled={disabled}
            pagedNavigation
          />
          <div className="p-3">
            <div className="flex items-center gap-16">
              <div>
                <div className="flex items-center mb-2">
                  <Label>Start Time</Label>
                </div>
                <div className="flex gap-2">
                  <Select
                    value={startTime.hour}
                    onValueChange={(value) => setStartTime({ ...startTime, hour: value })}
                    disabled={calendarDate?.from === undefined}
                  >
                    <SelectTrigger className="w-[80px]">
                      <SelectValue placeholder="Hour" />
                    </SelectTrigger>
                    <SelectContent>
                      {hours.map((hour) => (
                        <SelectItem key={`start-hour-${hour}`} value={hour}>
                          {hour}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="flex items-center">:</span>
                  <Select
                    value={startTime.minute}
                    onValueChange={(value) => setStartTime({ ...startTime, minute: value })}
                    disabled={calendarDate?.from === undefined}
                  >
                    <SelectTrigger className="w-[80px]">
                      <SelectValue placeholder="Minute" />
                    </SelectTrigger>
                    <SelectContent>
                      {minutes.map((minute) => (
                        <SelectItem key={`start-minute-${minute}`} value={minute}>
                          {minute}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <div className="flex items-center mb-2">
                  <Label>End Time</Label>
                </div>
                <div className="flex gap-2">
                  <Select
                    value={endTime.hour}
                    onValueChange={(value) => setEndTime({ ...endTime, hour: value })}
                    disabled={calendarDate?.to === undefined}
                  >
                    <SelectTrigger className="w-[80px]">
                      <SelectValue placeholder="Hour" />
                    </SelectTrigger>
                    <SelectContent>
                      {hours.map((hour) => (
                        <SelectItem key={`end-hour-${hour}`} value={hour}>
                          {hour}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="flex items-center">:</span>
                  <Select
                    value={endTime.minute}
                    onValueChange={(value) => setEndTime({ ...endTime, minute: value })}
                    disabled={calendarDate?.to === undefined}
                  >
                    <SelectTrigger className="w-[80px]">
                      <SelectValue placeholder="Minute" />
                    </SelectTrigger>
                    <SelectContent>
                      {minutes.map((minute) => (
                        <SelectItem key={`end-minute-${minute}`} value={minute}>
                          {minute}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-end p-4 pt-2">
            <Button
              disabled={calendarDate?.from === undefined || calendarDate?.to === undefined}
              onClick={() => {
                searchParams.delete("pastHours");
                searchParams.set("pageNumber", "0");
                searchParams.set("startDate", calendarDate?.from?.toISOString() ?? "");
                searchParams.set("endDate", calendarDate?.to?.toISOString() ?? "");
                setIsPopoverOpen(false);
                router.push(`${pathName}?${searchParams.toString()}`);
              }}
              handleEnter
            >
              Apply
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function getTimeDifference(from: Date, to: Date): string {
  const totalHours = differenceInHours(to, from);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = differenceInMinutes(to, from) % 60;

  if (days > 0) {
    return `${days}d`;
  } else if (hours > 0) {
    return `${hours}h`;
  } else {
    return `${minutes}m`;
  }
}

const COMPACT_RANGES: DateRange[] = [
  {
    name: "1 hour",
    value: "1",
  },
  {
    name: "3 hours",

    value: "3",
  },
  {
    name: "1 day",
    value: "24",
  },
  {
    name: "3 days",
    value: (24 * 3).toString(),
  },
  {
    name: "1 week",
    value: (24 * 7).toString(),
  },
  {
    name: "2 weeks",
    value: (24 * 7 * 2).toString(),
  },
  {
    name: "1 month",
    value: (24 * 7 * 4).toString(),
  },
  {
    name: "All",
    value: "all",
  },
];

export function CompactDateRangeFilter({
  disabled = { after: new Date(), before: subYears(new Date(), 1) },
}: {
  disabled?: CalendarProps["disabled"];
}) {
  const searchParams = new URLSearchParams(useSearchParams().toString());
  const pathName = usePathname();
  const router = useRouter();
  const pastHours = searchParams.get("pastHours");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [calendarDate, setCalendarDate] = useState<ReactDateRange | undefined>(undefined);
  const [showCalendar, setShowCalendar] = useState(false);

  const displayRange = useMemo(() => {
    if (startDate && endDate) {
      return { from: new Date(startDate), to: new Date(endDate) };
    } else if (pastHours && pastHours !== "all") {
      const to = new Date();
      const from = subHours(to, parseInt(pastHours));
      return { from, to };
    } else if (pastHours === "all") {
      return null;
    }
    const to = new Date();
    const from = subHours(to, 24);
    return { from, to };
  }, [endDate, pastHours, startDate]);

  useEffect(() => {
    if (startDate && endDate) {
      setCalendarDate({ from: new Date(startDate), to: new Date(endDate) });
    } else if (pastHours) {
      setCalendarDate(undefined);
    }
  }, [startDate, endDate, pastHours]);

  // Reset to quick ranges view when popover closes
  useEffect(() => {
    if (!isPopoverOpen) {
      setShowCalendar(false);
    }
  }, [isPopoverOpen]);

  const handleQuickRangeSelect = (rangeValue: string) => {
    setCalendarDate(undefined);
    searchParams.delete("startDate");
    searchParams.delete("endDate");
    searchParams.delete("groupByInterval");
    searchParams.set("pastHours", rangeValue);
    searchParams.set("pageNumber", "0");
    setIsPopoverOpen(false);
    router.push(`${pathName}?${searchParams.toString()}`);
  };

  const handleCalendarSelect = (range: ReactDateRange | undefined) => {
    setCalendarDate(range);

    if (range?.from && range?.to) {
      const from = new Date(range.from);
      from.setHours(0, 0, 0, 0);

      const to = new Date(range.to);
      to.setHours(23, 59, 59, 999);

      searchParams.delete("pastHours");
      searchParams.set("pageNumber", "0");
      searchParams.set("startDate", from.toISOString());
      searchParams.set("endDate", to.toISOString());
      setIsPopoverOpen(false);
      router.push(`${pathName}?${searchParams.toString()}`);
    }
  };

  return (
    <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn("justify-between text-left font-normal text-xs", !displayRange && "text-muted-foreground")}
        >
          <div className="flex items-center space-x-2">
            {displayRange ? (
              <>
                <Badge className="text-xs bg-accent hover:bg-secondary py-px px-2 mr-2">
                  {getTimeDifference(displayRange.from, displayRange.to)}
                </Badge>
                <span className="text-muted-foreground">
                  {formatDate(displayRange.from, "MMM d, h:mm a")} - {formatDate(displayRange.to, "MMM d, h:mm a")}
                </span>
              </>
            ) : (
              <span>All time</span>
            )}
          </div>
          <CalendarIcon className="ml-2 size-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 overflow-hidden w-auto" align="start">
        <AnimatePresence mode="wait" initial={false}>
          {!showCalendar ? (
            <motion.div
              key="ranges"
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              transition={{ duration: 0.1 }}
            >
              <div className="p-1 w-62">
                <div className="px-2 py-1.5 text-xs text-muted-foreground mb-1">Quick ranges</div>
                <div>
                  {COMPACT_RANGES.map((range) => (
                    <div
                      key={range.value}
                      className={cn(
                        "relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 px-2 text-xs outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
                        pastHours === range.value && "bg-accent text-accent-foreground"
                      )}
                      onClick={() => handleQuickRangeSelect(range.value)}
                    >
                      {range.name}
                    </div>
                  ))}
                  <div
                    className="relative flex w-full cursor-pointer select-none items-center justify-between rounded-sm py-1.5 px-2 text-xs outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                    onClick={() => setShowCalendar(true)}
                  >
                    <span>Absolute date</span>
                    <ChevronRight className="size-4" />
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="calendar"
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 20, opacity: 0 }}
              transition={{ duration: 0.1 }}
            >
              <div className="p-2 border-b flex items-center">
                <Button
                  variant="ghost"
                  size="sm"
                  className="p-0 h-auto hover:bg-transparent"
                  onClick={() => setShowCalendar(false)}
                >
                  <ArrowLeft className="size-3.5 mr-1" />
                  <span>Back</span>
                </Button>
              </div>
              <Calendar
                className="w-full"
                mode="range"
                defaultMonth={calendarDate?.from}
                selected={calendarDate}
                onSelect={handleCalendarSelect}
                disabled={disabled}
                pagedNavigation
              />
            </motion.div>
          )}
        </AnimatePresence>
      </PopoverContent>
    </Popover>
  );
}

export default function DateRangeFilter({
  disabled = { after: new Date(), before: subYears(new Date(), 1) },
}: {
  disabled?: CalendarProps["disabled"];
}) {
  const searchParams = new URLSearchParams(useSearchParams().toString());
  const pathName = usePathname();
  const router = useRouter();
  const pastHours = searchParams.get("pastHours");
  let selectedRange: DateRange | undefined = undefined;
  if (pastHours !== null) {
    selectedRange = RANGES.find((range) => range.value === pastHours) ?? RANGES[1];
  }

  return (
    <div className="flex items-start flex-none space-x-4">
      <div className="flex rounded-md border h-7 text-xs font-medium text-secondary-foreground">
        {
          <>
            {RANGES.map((range, index) => (
              <div
                key={index}
                className={cn(
                  "h-full items-center flex px-2 cursor-pointer border-r",
                  range.value === selectedRange?.value ? "bg-muted text-white" : "hover:bg-secondary"
                )}
                onClick={() => {
                  searchParams.delete("startDate");
                  searchParams.delete("endDate");
                  searchParams.delete("groupByInterval");
                  searchParams.set("pastHours", range.value);
                  searchParams.set("pageNumber", "0");
                  router.push(`${pathName}?${searchParams.toString()}`);
                }}
              >
                {range.name}
              </div>
            ))}
            <AbsoluteDateRangeFilter disabled={disabled} />
          </>
        }
      </div>
    </div>
  );
}
