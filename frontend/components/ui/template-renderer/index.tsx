import { z } from "zod";

export type TemplateScope = "span" | "trace";

export interface Template {
  id: string;
  name: string;
  code: string;
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
  code: `function({ data }) {
  // This template uses HTML syntax for data rendering

  return (
    <div>
      Data {JSON.stringify(data)}
    </div>
  );
}`,
  scope: "span",
  whereClause: null,
  testData: "",
};

export const defaultTraceTemplateCode = `function({ data }) {
  // data.spans: spans matching the template's SQL filter, ordered by start time.
  // Each span has spanId, name, path, spanType, startTime, endTime, status,
  // model, input, output, attributes. data.truncated is true when capped.

  return (
    <div className="p-4 space-y-3">
      {data.spans.map((span) => (
        <div key={span.spanId} className="rounded-md border border-border p-3">
          <div className="text-sm font-medium">{span.name}</div>
          <pre className="mt-1 text-xs overflow-x-auto">{JSON.stringify(span.output, null, 2)}</pre>
        </div>
      ))}
      {data.truncated && <div className="text-xs text-destructive">Span list truncated.</div>}
    </div>
  );
}`;
