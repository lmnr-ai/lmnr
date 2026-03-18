import { getDefaultSchemaFields, type SchemaField } from "@/components/signals/utils";
import { type Filter } from "@/lib/actions/common/filters";
import { type Signal } from "@/lib/actions/signals";

export type TriggerFormItem = {
  /** Undefined for new triggers that haven't been saved yet */
  id?: string;
  filters: Filter[];
};

export type ManageSignalForm = Omit<Signal, "isSemantic" | "createdAt" | "id" | "structuredOutput"> & {
  id?: string;
  schemaFields: SchemaField[];
  testTraceId?: string;
  triggers: TriggerFormItem[];
};

export const getDefaultValues = (projectId: string): ManageSignalForm => ({
  name: "",
  prompt: "",
  schemaFields: getDefaultSchemaFields(),
  projectId,
  testTraceId: "",
  triggers: [],
});
