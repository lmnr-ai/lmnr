import { z } from "zod";

export interface Template {
  id: string;
  name: string;
  code: string;
}

export const manageTemplateSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Template name is required"),
  code: z.string().min(1, "Template code is required"),
  testData: z.string().optional(),
});

export type ManageTemplateForm = z.infer<typeof manageTemplateSchema>;

export const defaultTemplateValues: ManageTemplateForm = {
  name: "",
  code: `function({ data }) {
  // This template uses HTML syntax for data rendering

  return (
    <div>
      Data {JSON.stringify(data)}
    </div>
  );
}`,
  testData: "",
};
