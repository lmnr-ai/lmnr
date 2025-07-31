import { z } from "zod/v4";

const RelativeTimeInputSchema = z.object({
  pastHours: z.union([z.string(), z.number()]).refine(
    (hours) => {
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
});

export type TimeInput = z.infer<typeof TimeInputSchema>;
export type TimeParameters = z.infer<typeof TimeParametersSchema>;

export function convertToTimeParameters(input: TimeInput, defaultHours: number = 24): TimeParameters {
  const validatedInput = TimeInputSchema.parse(input);

  if ("startTime" in validatedInput && "endTime" in validatedInput) {
    const start = new Date(validatedInput.startTime);
    const end = new Date(validatedInput.endTime);

    return TimeParametersSchema.parse({
      start_time: start.toISOString().slice(0, -1).replace("T", " "),
      end_time: end.toISOString().slice(0, -1).replace("T", " "),
    });
  }

  const hours =
    typeof validatedInput.pastHours === "string" ? parseInt(validatedInput.pastHours) : validatedInput.pastHours;

  const now = new Date();
  const start = new Date(now.getTime() - hours * 60 * 60 * 1000);

  return TimeParametersSchema.parse({
    start_time: start.toISOString().slice(0, -1).replace("T", " "),
    end_time: now.toISOString().slice(0, -1).replace("T", " "),
  });
}
