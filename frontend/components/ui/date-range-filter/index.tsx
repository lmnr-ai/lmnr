"use client";

import { formatDate, subYears } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, CalendarIcon, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DateRange as ReactDateRange } from "react-day-picker";

import { Badge } from "@/components/ui/badge.tsx";
import { cn } from "@/lib/utils";

import { Button } from "../button";
import { Calendar, CalendarProps } from "../calendar";
import { Input } from "../input";
import { Label } from "../label";
import { Popover, PopoverContent, PopoverTrigger } from "../popover";
import { getTimeDifference, QUICK_RANGES, useDateRangeState } from "./utils";

const DateRangeButton = ({ displayRange }: { displayRange: { from: Date; to: Date } | null }) => (
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
);

const QuickRangesList = ({
  pastHours,
  onSelect,
  onAbsoluteClick,
}: {
  pastHours: string | null;
  onSelect: (value: string) => void;
  onAbsoluteClick: () => void;
}) => (
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
        {QUICK_RANGES.map((range) => (
          <div
            key={range.value}
            className={cn(
              "relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 px-2 text-xs outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
              pastHours === range.value && "bg-accent text-accent-foreground"
            )}
            onClick={() => onSelect(range.value)}
          >
            {range.name}
          </div>
        ))}
        <div
          className="relative flex w-full cursor-pointer select-none items-center justify-between rounded-sm py-1.5 px-2 text-xs outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
          onClick={onAbsoluteClick}
        >
          <span>Absolute date</span>
          <ChevronRight className="size-4" />
        </div>
      </div>
    </div>
  </motion.div>
);

const TimeSelector = ({
  label,
  time,
  onChange,
  disabled,
}: {
  label: string;
  time: string;
  onChange: (time: string) => void;
  disabled: boolean;
}) => (
  <div className="flex flex-col gap-1">
    <Label className="text-xs">{label}</Label>
    <Input
      type="time"
      value={time}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-fit appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
    />
  </div>
);

const AbsoluteDatePicker = ({
  calendarDate,
  onCalendarChange,
  startTime,
  onStartTimeChange,
  endTime,
  onEndTimeChange,
  onBack,
  onApply,
  disabled,
}: {
  calendarDate: ReactDateRange | undefined;
  onCalendarChange: (date: ReactDateRange | undefined) => void;
  startTime: string;
  onStartTimeChange: (time: string) => void;
  endTime: string;
  onEndTimeChange: (time: string) => void;
  onBack: () => void;
  onApply: () => void;
  disabled: CalendarProps["disabled"];
}) => (
  <motion.div
    key="calendar"
    initial={{ x: 20, opacity: 0 }}
    animate={{ x: 0, opacity: 1 }}
    exit={{ x: 20, opacity: 0 }}
    transition={{ duration: 0.1 }}
  >
    <div className="p-2 border-b flex items-center">
      <Button variant="ghost" size="sm" className="p-0 h-auto hover:bg-transparent" onClick={onBack}>
        <ArrowLeft className="size-3.5 mr-1" />
        <span>Back</span>
      </Button>
    </div>
    <Calendar
      mode="range"
      defaultMonth={calendarDate?.from}
      selected={calendarDate}
      onSelect={onCalendarChange}
      numberOfMonths={2}
      disabled={disabled}
      pagedNavigation
    />
    <div className="grid grid-cols-2 px-4 py-2">
      <TimeSelector label="Start Time" time={startTime} onChange={onStartTimeChange} disabled={!calendarDate?.from} />
      <TimeSelector label="End Time" time={endTime} onChange={onEndTimeChange} disabled={!calendarDate?.to} />
    </div>
    <div className="flex justify-end p-4 pt-2">
      <Button disabled={!calendarDate?.from || !calendarDate?.to} onClick={onApply} handleEnter>
        Apply
      </Button>
    </div>
  </motion.div>
);

export default function DateRangeFilter({
  disabled = { after: new Date(), before: subYears(new Date(), 1) },
  buttonDisabled = false,
  className,
}: {
  disabled?: CalendarProps["disabled"];
  buttonDisabled?: boolean;
  className?: string;
}) {
  const pathName = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

  const { pastHours, displayRange, calendarDate, setCalendarDate, startTime, setStartTime, endTime, setEndTime } =
    useDateRangeState();

  useEffect(() => {
    if (!isPopoverOpen) {
      setShowCalendar(false);
    }
  }, [isPopoverOpen]);

  const handleQuickRangeSelect = (rangeValue: string) => {
    const newSearchParams = new URLSearchParams(searchParams.toString());
    newSearchParams.delete("startDate");
    newSearchParams.delete("endDate");
    newSearchParams.delete("groupByInterval");
    newSearchParams.set("pastHours", rangeValue);
    newSearchParams.set("pageNumber", "0");
    setIsPopoverOpen(false);
    router.push(`${pathName}?${newSearchParams.toString()}`);
  };

  const handleCalendarApply = () => {
    if (!calendarDate?.from || !calendarDate?.to) return;

    const from = new Date(calendarDate.from);
    const [startHour, startMinute] = startTime.split(":").map(Number);
    from.setHours(startHour);
    from.setMinutes(startMinute);

    const to = new Date(calendarDate.to);
    const [endHour, endMinute] = endTime.split(":").map(Number);
    to.setHours(endHour);
    to.setMinutes(endMinute);

    const newSearchParams = new URLSearchParams(searchParams.toString());
    newSearchParams.delete("pastHours");
    newSearchParams.set("pageNumber", "0");
    newSearchParams.set("startDate", from.toISOString());
    newSearchParams.set("endDate", to.toISOString());
    setIsPopoverOpen(false);
    router.push(`${pathName}?${newSearchParams.toString()}`);
  };

  return (
    <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
      <PopoverTrigger asChild>
        <Button
          disabled={buttonDisabled}
          variant="outline"
          className={cn(
            "justify-between text-left font-normal text-xs",
            !displayRange && "text-muted-foreground",
            className
          )}
        >
          <DateRangeButton displayRange={displayRange} />
          <CalendarIcon className="ml-2 size-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 overflow-hidden w-auto" align="start">
        <AnimatePresence mode="wait" initial={false}>
          {!showCalendar ? (
            <QuickRangesList
              pastHours={pastHours}
              onSelect={handleQuickRangeSelect}
              onAbsoluteClick={() => setShowCalendar(true)}
            />
          ) : (
            <AbsoluteDatePicker
              calendarDate={calendarDate}
              onCalendarChange={setCalendarDate}
              startTime={startTime}
              onStartTimeChange={setStartTime}
              endTime={endTime}
              onEndTimeChange={setEndTime}
              onBack={() => setShowCalendar(false)}
              onApply={handleCalendarApply}
              disabled={disabled}
            />
          )}
        </AnimatePresence>
      </PopoverContent>
    </Popover>
  );
}
