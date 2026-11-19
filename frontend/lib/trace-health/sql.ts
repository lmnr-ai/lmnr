import { type TraceHealthCheckId } from "./checks";

export const NIL_UUID = "00000000-0000-0000-0000-000000000000";

// Payloads of 4 chars or fewer are empty in practice: '', 'null', '[]', '{}', '""'.
export const LLM_NO_INPUT = "span_type = 'LLM' AND length(input) <= 4";
export const LLM_NO_OUTPUT = "span_type = 'LLM' AND length(output) <= 4";
export const TOOL_NO_OUTPUT = "span_type = 'TOOL' AND length(output) <= 4";
export const LLM_NO_MODEL = "span_type = 'LLM' AND model = ''";
// Failed calls never return usage, so only successful ones count.
export const NOT_ERROR = "status != 'error'";
export const LLM_NO_USAGE = `span_type = 'LLM' AND ${NOT_ERROR} AND total_tokens = 0`;
export const LLM_NO_COST = "span_type = 'LLM' AND total_tokens > 0 AND total_cost = 0";
export const IS_ROOT = `parent_span_id = toUUID('${NIL_UUID}')`;

// Same checks over the raw `spans` table, which the dialog queries. The view rebuilds each deduped
// payload from the content dictionaries just to measure it (~100x the memory); a raw row carries
// content only as message hashes or as a literal payload, so either one being present is enough.
// span_kind 1 = LLM, 6 = TOOL.
export const RAW_LLM = "span_kind = 1";
export const RAW_TOOL = "span_kind = 6";
export const RAW_LLM_NO_INPUT = `${RAW_LLM} AND empty(input_message_hashes) AND length(input) <= 4`;
export const RAW_LLM_NO_OUTPUT = `${RAW_LLM} AND empty(output_message_hashes) AND length(output) <= 4`;
export const RAW_TOOL_NO_OUTPUT = `${RAW_TOOL} AND empty(output_message_hashes) AND length(output) <= 4`;
export const RAW_LLM_NO_MODEL = `${RAW_LLM} AND model = ''`;
export const RAW_LLM_OK = `${RAW_LLM} AND ${NOT_ERROR}`;
export const RAW_LLM_NO_USAGE = `${RAW_LLM_OK} AND total_tokens = 0`;
export const RAW_LLM_NO_COST = `${RAW_LLM} AND total_tokens > 0 AND total_cost = 0`;

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
