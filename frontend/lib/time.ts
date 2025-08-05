import { differenceInHours, format, parseISO } from "date-fns";
import { z } from "zod/v4";

import { GroupByInterval } from "@/lib/clickhouse/modifiers";

// No 'healthy' data may be recorded before this date, as this is the
// start of Laminar minus a good buffer.
const EARLIEST_DATE = new Date("2023-01-01");

const RelativeTimeInputSchema = z.object({
  pastHours: z.union([z.string(), z.number()]).refine(
    (hours) => {
      if (hours === "all") {
        return true;
      }

      const parsed = typeof hours === "string" ? parseInt(hours) : hours;
      return !isNaN(parsed) && parsed > 0;
    },
    {
      message: "pastHours must be a positive number",
    }
  ),
});

const AbsoluteTimeInputSchema = z
  .object({
    startTime: z.string(),
    endTime: z.string(),
  })
  .refine(
    (data) => {
      const start = new Date(data.startTime);
      const end = new Date(data.endTime);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return false;
      }

      return start < end;
    },
    {
      message: "Invalid date format or start date must be before end date",
    }
  );

const TimeInputSchema = z.union([RelativeTimeInputSchema, AbsoluteTimeInputSchema]);

const TimeParametersSchema = z.object({
  start_time: z.string(),
  end_time: z.string(),
  interval_unit: z.string(),
});

export type TimeInput = z.infer<typeof TimeInputSchema>;
export type TimeParameters = z.infer<typeof TimeParametersSchema>;

const inferGroupByInterval = (startTime: Date, endTime: Date): GroupByInterval => {
  const diffInHours = differenceInHours(endTime, startTime);

  if (diffInHours <= 1) {
    return GroupByInterval.Minute;
  } else if (diffInHours <= 24) {
    return GroupByInterval.Hour;
  } else {
    return GroupByInterval.Day;
  }
};

export const convertToTimeParameters = (input: TimeInput, groupByInterval?: GroupByInterval): TimeParameters => {
  const validatedInput = TimeInputSchema.parse(input);

  if ("startTime" in validatedInput && "endTime" in validatedInput) {
    const start = parseISO(validatedInput.startTime);
    const end = parseISO(validatedInput.endTime);

    const interval = groupByInterval || inferGroupByInterval(start, end);

    return TimeParametersSchema.parse({
      start_time: format(start, "yyyy-MM-dd HH:mm:ss.SSS"),
      end_time: format(end, "yyyy-MM-dd HH:mm:ss.SSS"),
      interval_unit: interval.toUpperCase(),
    });
  }

  if (validatedInput.pastHours === "all") {
    return TimeParametersSchema.parse({
      start_time: format(EARLIEST_DATE, "yyyy-MM-dd HH:mm:ss.SSS"),
      end_time: format(new Date(), "yyyy-MM-dd HH:mm:ss.SSS"),
      interval_unit: groupByInterval?.toUpperCase() || GroupByInterval.Day.toUpperCase(),
    });
  }

  const hours =
    typeof validatedInput.pastHours === "string" ? parseInt(validatedInput.pastHours) : validatedInput.pastHours;

  const now = new Date();
  const start = new Date(now.getTime() - hours * 60 * 60 * 1000);

  const interval = groupByInterval || inferGroupByInterval(start, now);

  return TimeParametersSchema.parse({
    start_time: format(start, "yyyy-MM-dd HH:mm:ss.SSS"),
    end_time: format(now, "yyyy-MM-dd HH:mm:ss.SSS"),
    interval_unit: interval.toUpperCase(),
  });
};
