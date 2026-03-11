import { getDefaultSchemaFields, type SchemaField } from "@/components/signals/utils";
import { type Signal } from "@/lib/actions/signals";

export type ManageSignalForm = Omit<Signal, "isSemantic" | "createdAt" | "id" | "structuredOutput"> & {
  id?: string;
  schemaFields: SchemaField[];
  testTraceId?: string;
};

export const getDefaultValues = (projectId: string): ManageSignalForm => ({
  name: "",
  prompt: "",
  schemaFields: getDefaultSchemaFields(),
  projectId,
  testTraceId: "",
});
