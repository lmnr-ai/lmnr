import { z } from "zod";

export interface UserPreferences {
  dismissed_announcement_ids?: string[];
  [key: string]: unknown;
}

const UserPreferencesSchema: z.ZodType<UserPreferences> = z
  .object({
    dismissed_announcement_ids: z.array(z.string()).optional(),
  })
  .passthrough();

export const parseUserPreferences = (value: unknown): UserPreferences => {
  const parsed = UserPreferencesSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
};
