// Keep in sync with the "Failure Detector" entry in components/signals/prompts.ts.
export const DEFAULT_SIGNAL = {
  name: "Failure Detector",
  prompt: `Report every distinct error the agent made in this run that meets the bar below. One finding per distinct error. [IMPORTANT]: If nothing meets the bar, submit no findings. A clean run is a valid outcome, and an unsupported finding is worse than no finding.

Reportable:
1. A wrong action or flawed reasoning step that affected the outcome or wasted substantial work.
2. A violation of a stated instruction or precondition — from the system prompt, the user's request, or a tool's stated contract. Reportable even if the run continued past it and even if the agent later corrected it. An instruction here is an explicit requirement or prohibition; a description of a typical procedure, a suggestion, or general guidance ('keep changes minimal', 'test your work', 'you may use X') is not one, and departing from it is reportable only under rule 1 by its effect. A violation is a forbidden action the agent actually performed, or a required action or check it never performed; an attempt the environment rejected before it took effect, which the agent then corrected, is a slip under rule 5, not a violation. Formatting or wording deviations count when they are in the final answer or deliverable, or when the instruction states the format is required; the same deviation in intermediate reasoning or scratch output does not.
3. Repeated near-identical failures (same tool, same arguments, same kind of error) that together consumed a substantial part of the run, even if the agent eventually recovered. Report these as ONE finding: state how many times it happened and cite the spans.
4. A factual assurance made to the user that no tool result or provided context supports. Unsupported is enough; you do not need an in-trace contradiction for the agent's own claims. This includes an unqualified answer when the trace shows the agent saw conflicting sources, an alternative reading, or an unresolved check that would change it — the missing caveat is the error, whichever option the agent picked — and a claim about every item or the whole set when only a sample was checked.

Not reportable:
5. A single minor slip the agent corrected within a step or two. Rule 2 overrides this exemption: an instruction violation is reportable even when minor and corrected.
6. Skipping a planned lookup or verification, when the evidence the agent did gather is sufficient to support its answer. Rule 2 overrides this too: if the skipped step was itself a stated instruction, report it. So does rule 4: if the agent told the user the check was done, or its answer asserts something only the skipped step could establish (completeness of a search, that every item was checked), report it.

Grounding:
7. Cite the specific spans and quote the decisive evidence for every finding.
8. The agent's own reasoning is always in scope: flag a conclusion the trace's evidence doesn't support. This requires no external knowledge, only reading the trace.
9. External facts are different: never declare a result wrong from your own knowledge of the world unless the contradiction is visible in the trace itself. Never assert mechanical details the trace does not literally show — when judging "substantial" under rules 1 and 3, count the spans or tool calls you can actually see and cite them.
10. Never infer environment rules or prerequisites that are not stated. This does not limit rule 4: the agent's assurances still need support.`,
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
