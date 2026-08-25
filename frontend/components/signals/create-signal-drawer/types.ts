import { getDefaultSchemaFields, type SchemaField } from "@/components/signals/utils";
import { type Filter } from "@/lib/actions/common/filters";
import { Operator } from "@/lib/actions/common/operators";
import { type Signal } from "@/lib/actions/signals";

export type ManageSignalContentVariant = "sheet" | "panel";

export type TriggerFormItem = {
  /** Undefined for new triggers that haven't been saved yet */
  id?: string;
  /** When to evaluate. Exactly one condition — root span finished, or named spans. */
  conditions: Filter[];
  /** Whether a fired trigger actually runs. Total tokens / status. */
  filters: Filter[];
  /** 0 = batch, 1 = realtime */
  mode: number;
};

export type ManageSignalForm = Omit<Signal, "isSemantic" | "createdAt" | "id" | "structuredOutput"> & {
  id?: string;
  schemaFields: SchemaField[];
  testTraceId?: string;
  triggers: TriggerFormItem[];
};

export const getDefaultTriggers = (defaultMode: number): TriggerFormItem[] => [
  {
    conditions: [{ column: "root_span_finished", operator: Operator.Eq, value: "true" }],
    filters: [{ column: "total_token_count", operator: Operator.Gt, value: 1000 }],
    mode: defaultMode,
  },
];

export const getDefaultValues = (projectId: string, defaultMode: number): ManageSignalForm => ({
  name: "",
  prompt: "",
  schemaFields: getDefaultSchemaFields(),
  projectId,
  testTraceId: "",
  triggers: getDefaultTriggers(defaultMode),
  sampleRate: null,
  disabled: false,
});
