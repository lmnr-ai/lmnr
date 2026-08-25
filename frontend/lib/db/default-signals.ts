// Keep in sync with the "Failure Detector" entry in components/signals/prompts.ts.
export const DEFAULT_SIGNAL = {
  name: "Failure Detector",
  prompt: `Find the most significant error the agent made in this run, if any: \
a wrong action, flawed logic, or failure that affected the outcome or wasted \
significant work. Minor issues the agent immediately recovered from are not \
findings. Cite the specific spans and quote the decisive evidence.`,
  structuredOutputSchema: {
    type: "object",
    required: ["description"],
    properties: {
      description: {
        type: "string",
        description: "What went wrong, the decisive evidence with span references, and the impact on the run's outcome",
      },
    },
  },
};

/** When the signal is evaluated. Always exactly one condition. */
export const DEFAULT_SIGNAL_TRIGGER_VALUE = [{ column: "root_span_finished", operator: "eq", value: "true" }];

/** Whether a fired trigger actually runs — keeps trivial traces from being billed. */
export const DEFAULT_SIGNAL_TRIGGER_FILTERS = [{ column: "total_token_count", operator: "gt", value: "1000" }];
