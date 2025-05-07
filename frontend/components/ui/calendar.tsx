"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import * as React from "react";
import { ChevronProps, DayFlag, DayPicker, Months, SelectionState, UI } from "react-day-picker";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function CustomChevron({ ...props }: ChevronProps): React.ReactElement {
  const { orientation } = props;
  if (orientation === "left") {
    return <ChevronLeftIcon className="h-4 w-4 text-foreground" />;
  } else if (orientation === "right") {
    return <ChevronRightIcon className="h-4 w-4 text-foreground" />;
  }
  return <></>;
}

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        [UI.Months]: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        [UI.Month]: "space-y-4",
        [UI.MonthCaption]: "flex justify-center pt-1 relative items-center",
        [UI.CaptionLabel]: "text-sm font-medium",
        // w-[x%] is a quick hack to fix the absolute positioning issues
        [UI.Nav]: "absolute top-0 pt-3 flex justify-between w-[calc(100%_-_24px)]",
        [UI.PreviousMonthButton]: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 p-0 opacity-50 hover:opacity-100"
        ),
        [UI.NextMonthButton]: cn(buttonVariants({ variant: "outline" }), "h-7 w-7 p-0 opacity-50 hover:opacity-100"),
        [UI.MonthGrid]: "w-full border-collapse space-y-1",
        [UI.Weekdays]: "flex",
        [UI.Weekday]: "text-muted-foreground rounded-md w-8 font-normal text-[0.8rem]",
        [UI.Week]: "flex w-full mt-2",
        [UI.Day]: cn(
          "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-accent [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected].day-range-end)]:rounded-r-md",
          props.mode === "range"
            ? "[&:has(>.day-range-end)]:rounded-r-md [&:has(>.day-range-start)]:rounded-l-md first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md"
            : "[&:has([aria-selected])]:rounded-md"
        ),
        [UI.DayButton]: cn(buttonVariants({ variant: "ghost" }), "h-8 w-8 p-0 font-normal aria-selected:opacity-100"),
        [SelectionState.range_start]: "day-range-start",
        [SelectionState.range_end]: "day-range-end",
        [SelectionState.selected]:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        [DayFlag.today]: "bg-accent text-accent-foreground",
        [DayFlag.outside]:
          "day-outside text-muted-foreground opacity-50  aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
        [DayFlag.disabled]: "text-muted-foreground opacity-50",
        [SelectionState.range_middle]: "aria-selected:bg-accent aria-selected:text-accent-foreground",
        [DayFlag.hidden]: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: CustomChevron,
        Months: (props) => (
          <>
            {/* space for nav, which is absolutely positioned. Without this hack,
            the clickable areas of the nav arrows are off (Since react-day-picker v9) */}
            <div className="h-8" />
            <Months {...props} />
          </>
        ),
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
