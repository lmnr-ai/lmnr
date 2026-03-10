"use client";

import cronstrue from "cronstrue";
import { useCallback, useMemo, useState } from "react";

import { cn } from "@/lib/utils";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

type Frequency = "minute" | "hour" | "day" | "week" | "month";

const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: "minute", label: "Minute" },
  { value: "hour", label: "Hour" },
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: String(i),
  label: i === 0 ? "12:00 AM" : i < 12 ? `${i}:00 AM` : i === 12 ? "12:00 PM" : `${i - 12}:00 PM`,
}));

const DAYS_OF_WEEK = [
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
  { value: "0", label: "Sunday" },
];

const DAYS_OF_MONTH = Array.from({ length: 31 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}));

const MINUTE_STEPS = [
  { value: "1", label: "every minute" },
  { value: "5", label: "every 5 minutes" },
  { value: "10", label: "every 10 minutes" },
  { value: "15", label: "every 15 minutes" },
  { value: "30", label: "every 30 minutes" },
];

const HOUR_STEPS = [
  { value: "1", label: "every hour" },
  { value: "2", label: "every 2 hours" },
  { value: "3", label: "every 3 hours" },
  { value: "4", label: "every 4 hours" },
  { value: "6", label: "every 6 hours" },
  { value: "8", label: "every 8 hours" },
  { value: "12", label: "every 12 hours" },
];

interface EasyState {
  frequency: Frequency;
  hour: string;
  dayOfWeek: string;
  dayOfMonth: string;
  minuteStep: string;
  hourStep: string;
}

function easyStateToCron(s: EasyState): string {
  switch (s.frequency) {
    case "minute": {
      const step = s.minuteStep === "1" ? "*" : `*/${s.minuteStep}`;
      return `${step} * * * *`;
    }
    case "hour": {
      const step = s.hourStep === "1" ? "*" : `*/${s.hourStep}`;
      return `0 ${step} * * *`;
    }
    case "day":
      return `0 ${s.hour} * * *`;
    case "week":
      return `0 ${s.hour} * * ${s.dayOfWeek}`;
    case "month":
      return `0 ${s.hour} ${s.dayOfMonth} * *`;
  }
}

function cronToEasyState(cron: string): EasyState | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [min, hr, dom, mon, dow] = parts;

  if (mon !== "*") return null;

  if (hr === "*" && dom === "*" && dow === "*") {
    if (min === "*")
      return { frequency: "minute", hour: "9", dayOfWeek: "1", dayOfMonth: "1", minuteStep: "1", hourStep: "1" };
    const stepMatch = min.match(/^\*\/(\d+)$/);
    if (stepMatch && MINUTE_STEPS.some((o) => o.value === stepMatch[1])) {
      return {
        frequency: "minute",
        hour: "9",
        dayOfWeek: "1",
        dayOfMonth: "1",
        minuteStep: stepMatch[1],
        hourStep: "1",
      };
    }
  }

  if (min === "0" && dom === "*" && dow === "*") {
    if (hr === "*")
      return { frequency: "hour", hour: "9", dayOfWeek: "1", dayOfMonth: "1", minuteStep: "5", hourStep: "1" };
    const stepMatch = hr.match(/^\*\/(\d+)$/);
    if (stepMatch && HOUR_STEPS.some((o) => o.value === stepMatch[1])) {
      return {
        frequency: "hour",
        hour: "9",
        dayOfWeek: "1",
        dayOfMonth: "1",
        minuteStep: "5",
        hourStep: stepMatch[1],
      };
    }
  }

  if (min === "0" && /^\d+$/.test(hr) && dom === "*" && dow === "*") {
    return { frequency: "day", hour: hr, dayOfWeek: "1", dayOfMonth: "1", minuteStep: "5", hourStep: "1" };
  }

  if (min === "0" && /^\d+$/.test(hr) && dom === "*" && /^\d$/.test(dow)) {
    return { frequency: "week", hour: hr, dayOfWeek: dow, dayOfMonth: "1", minuteStep: "5", hourStep: "1" };
  }

  if (min === "0" && /^\d+$/.test(hr) && /^\d+$/.test(dom) && dow === "*") {
    return { frequency: "month", hour: hr, dayOfWeek: "1", dayOfMonth: dom, minuteStep: "5", hourStep: "1" };
  }

  return null;
}

const DEFAULT_EASY: EasyState = {
  frequency: "day",
  hour: "9",
  dayOfWeek: "1",
  dayOfMonth: "1",
  minuteStep: "5",
  hourStep: "1",
};

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

function getNextRuns(state: EasyState, count: number): Date[] {
  const now = new Date();
  const dates: Date[] = [];

  const nextFrom = (from: Date): Date => {
    const d = new Date(from);

    switch (state.frequency) {
      case "minute": {
        const step = Number(state.minuteStep);
        d.setSeconds(0, 0);
        d.setMinutes(d.getMinutes() + 1);
        if (step > 1) {
          const remainder = d.getMinutes() % step;
          if (remainder !== 0) d.setMinutes(d.getMinutes() + (step - remainder));
        }
        return d;
      }
      case "hour": {
        const step = Number(state.hourStep);
        d.setMinutes(0, 0, 0);
        d.setHours(d.getHours() + 1);
        if (step > 1) {
          const remainder = d.getHours() % step;
          if (remainder !== 0) d.setHours(d.getHours() + (step - remainder));
        }
        return d;
      }
      case "day": {
        const hr = Number(state.hour);
        d.setMinutes(0, 0, 0);
        d.setHours(hr);
        if (d <= from) d.setDate(d.getDate() + 1);
        return d;
      }
      case "week": {
        const hr = Number(state.hour);
        const targetDay = Number(state.dayOfWeek);
        d.setMinutes(0, 0, 0);
        d.setHours(hr);
        const currentDay = d.getDay();
        let daysAhead = targetDay - currentDay;
        if (daysAhead < 0 || (daysAhead === 0 && d <= from)) daysAhead += 7;
        if (daysAhead === 0) daysAhead = 7;
        d.setDate(d.getDate() + daysAhead);
        return d;
      }
      case "month": {
        const hr = Number(state.hour);
        const targetDom = Number(state.dayOfMonth);
        d.setMinutes(0, 0, 0);
        d.setHours(hr);
        d.setDate(targetDom);
        if (d <= from) d.setMonth(d.getMonth() + 1);
        d.setDate(targetDom);
        return d;
      }
    }
  };

  let cursor = now;
  for (let i = 0; i < count; i++) {
    cursor = nextFrom(cursor);
    dates.push(new Date(cursor));
  }

  return dates;
}

interface CronInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function CronInput({ value, onChange, className }: CronInputProps) {
  const [state, setState] = useState<EasyState>(() => cronToEasyState(value) ?? DEFAULT_EASY);
  const [showMore, setShowMore] = useState(false);

  const dateFormatter = useMemo(() => new Intl.DateTimeFormat("en-US", DATE_FORMAT), []);
  const nextRuns = useMemo(() => getNextRuns(state, 4), [state]);

  const update = useCallback(
    (patch: Partial<EasyState>) => {
      setState((prev) => {
        const next = { ...prev, ...patch };
        onChange(easyStateToCron(next));
        return next;
      });
    },
    [onChange]
  );

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-secondary-foreground">Every</span>
        <Select value={state.frequency} onValueChange={(v: Frequency) => update({ frequency: v })}>
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FREQUENCIES.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {state.frequency === "minute" && (
          <Select value={state.minuteStep} onValueChange={(v) => update({ minuteStep: v })}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MINUTE_STEPS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {state.frequency === "hour" && (
          <Select value={state.hourStep} onValueChange={(v) => update({ hourStep: v })}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HOUR_STEPS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {state.frequency === "week" && (
          <>
            <span className="text-xs text-secondary-foreground">on</span>
            <Select value={state.dayOfWeek} onValueChange={(v) => update({ dayOfWeek: v })}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAYS_OF_WEEK.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}

        {state.frequency === "month" && (
          <>
            <span className="text-xs text-secondary-foreground">on day</span>
            <Select value={state.dayOfMonth} onValueChange={(v) => update({ dayOfMonth: v })}>
              <SelectTrigger className="w-16">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAYS_OF_MONTH.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}

        {(state.frequency === "day" || state.frequency === "week" || state.frequency === "month") && (
          <>
            <span className="text-xs text-secondary-foreground">at</span>
            <Select value={state.hour} onValueChange={(v) => update({ hour: v })}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOURS.map((h) => (
                  <SelectItem key={h.value} value={h.value}>
                    {h.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </div>

      {nextRuns.length > 0 && (
        <div className="flex flex-col gap-1 text-xs text-secondary-foreground">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowMore((prev) => !prev)}
              className="underline underline-offset-2 hover:text-secondary-foreground transition-colors"
            >
              next
            </button>
            <span className="tabular-nums">at {dateFormatter.format(nextRuns[0])}</span>
          </div>
          {showMore &&
            nextRuns.slice(1).map((date, i) => (
              <span key={i} className="tabular-nums">
                then at {dateFormatter.format(date)}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}

/** Convert a cron expression to a human-readable label using cronstrue. */
export function cronToLabel(cron: string): string {
  try {
    return cronstrue.toString(cron, { use24HourTimeFormat: false });
  } catch {
    return cron;
  }
}
