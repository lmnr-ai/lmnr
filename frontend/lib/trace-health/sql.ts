import { type TraceHealthCheckId } from "./checks";

export const NIL_UUID = "00000000-0000-0000-0000-000000000000";

// Payloads of 4 chars or fewer are empty in practice: '', 'null', '[]', '{}', '""'.
export const LLM_NO_INPUT = "span_type = 'LLM' AND length(input) <= 4";
export const LLM_NO_OUTPUT = "span_type = 'LLM' AND length(output) <= 4";
export const TOOL_NO_OUTPUT = "span_type = 'TOOL' AND length(output) <= 4";
export const LLM_NO_MODEL = "span_type = 'LLM' AND model = ''";
export const LLM_NO_USAGE = "span_type = 'LLM' AND total_tokens = 0";
export const LLM_NO_COST = "span_type = 'LLM' AND total_tokens > 0 AND total_cost = 0";
export const IS_ROOT = `parent_span_id = toUUID('${NIL_UUID}')`;

/** Per-trace column for each span-level check, used in the copied prompt's verification query. */
export const SPAN_CHECK_COLUMNS: Partial<Record<TraceHealthCheckId, string>> = {
  "llm-missing-input": `countIf(${LLM_NO_INPUT}) AS llm_spans_missing_input`,
  "llm-missing-output": `countIf(${LLM_NO_OUTPUT}) AS llm_spans_missing_output`,
  "tool-missing-output": `countIf(${TOOL_NO_OUTPUT}) AS tool_spans_missing_output`,
  "multiple-root-spans": `countIf(${IS_ROOT}) AS root_spans`,
  "llm-missing-model": `countIf(${LLM_NO_MODEL}) AS llm_spans_missing_model`,
  "llm-missing-usage": `countIf(${LLM_NO_USAGE}) AS llm_spans_missing_usage`,
  "llm-missing-cost": `countIf(${LLM_NO_COST}) AS llm_spans_missing_cost`,
};
