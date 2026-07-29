export const DEFAULT_SIGNAL = {
  name: "Failure Detector",
  prompt: `Analyze this trace for concrete issues: tool call failures, API errors, \
loops or repeated calls, wrong tool selection, and logic errors. \
Only report problems visible in the trace data.`,
  structuredOutputSchema: {
    type: "object",
    required: ["description", "category"],
    properties: {
      description: {
        type: "string",
        description: "Description of the issue: what happened, which span(s) are involved, and the impact",
      },
      category: {
        type: "string",
        enum: ["tool_error", "api_error", "logic_error", "looping", "wrong_tool", "timeout", "other"],
        description: "Category of the issue",
      },
    },
  },
};

/** When the signal is evaluated. Always exactly one condition. */
export const DEFAULT_SIGNAL_TRIGGER_VALUE = [{ column: "root_span_finished", operator: "eq", value: "true" }];

/** Whether a fired trigger actually runs — keeps trivial traces from being billed. */
export const DEFAULT_SIGNAL_TRIGGER_FILTERS = [{ column: "total_token_count", operator: "gt", value: "1000" }];
