import { z } from "zod/v4";

const TimeInputSchema = z
  .object({
    pastHours: z.union([z.string(), z.number()]).optional(),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
  })
  .refine(
    (data) =>
      // If using absolute dates, both must be provided
      !((data.startTime && !data.endTime) || (!data.startTime && data.endTime)),
    {
      message: "Both startDate and endDate must be provided when using absolute dates",
      path: ["startDate", "endDate"],
    }
  )
  .refine(
    (data) => {
      if (data.startTime && data.endTime) {
        const start = new Date(data.startTime);
        const end = new Date(data.endTime);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          return false;
        }

        if (start >= end) {
          return false;
        }
      }
      return true;
    },
    {
      message: "Invalid date format or start date must be before end date",
      path: ["startDate", "endDate"],
    }
  )
  .refine(
    (data) => {
      if (data.pastHours !== undefined) {
        const hours = typeof data.pastHours === "string" ? parseInt(data.pastHours) : data.pastHours;
        if (isNaN(hours) || hours < 0) {
          return false;
        }
      }
      return true;
    },
    {
      message: "pastHours must be a positive number",
      path: ["pastHours"],
    }
  );

const TimeParametersSchema = z.object({
  start_time: z.string(),
  end_time: z.string(),
});

export type TimeInput = z.infer<typeof TimeInputSchema>;
export type TimeParameters = z.infer<typeof TimeParametersSchema>;

export function convertToTimeParameters(input: TimeInput, defaultHours: number = 24): TimeParameters {
  // Validate input with Zod
  const validatedInput = TimeInputSchema.parse(input);
  const { pastHours, startTime, endTime } = validatedInput;

  // If absolute dates are provided, use them
  if (startTime && endTime) {
    const start = new Date(startTime);
    const end = new Date(endTime);

    return TimeParametersSchema.parse({
      start_time: Math.floor(start.getTime() / 1000).toString(),
      end_time: Math.floor(end.getTime() / 1000).toString(),
    });
  }

  const hours = pastHours ? (typeof pastHours === "string" ? parseInt(pastHours) : pastHours) : defaultHours;

  const now = new Date();
  const start = new Date(now.getTime() - hours * 60 * 60 * 1000);

  return TimeParametersSchema.parse({
    start_time: Math.floor(start.getTime() / 1000).toString(),
    end_time: Math.floor(now.getTime() / 1000).toString(),
  });
}
