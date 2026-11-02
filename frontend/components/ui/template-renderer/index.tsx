import { z } from "zod";

export type TemplateScope = "span" | "trace";

export interface Template {
  id: string;
  name: string;
  code: string;
  /** DB column carried by API rows. */
  type?: TemplateScope;
  /** Client-side form concept, mapped from `type`. */
  scope?: TemplateScope;
  whereClause?: string | null;
}

export const manageTemplateSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Template name is required"),
  code: z.string().min(1, "Template code is required"),
  scope: z.enum(["span", "trace"]).optional(),
  whereClause: z.string().nullish(),
  testData: z.string().optional(),
});

export type ManageTemplateForm = z.infer<typeof manageTemplateSchema>;

export const defaultTemplateValues: ManageTemplateForm = {
  name: "",
  // Empty by default — create starts with no code; the user either generates or
  // pastes their own. The disabled-when-no-code CTA guards submit.
  code: "",
  scope: "span",
  whereClause: null,
  testData: "",
};
