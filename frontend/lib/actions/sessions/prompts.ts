import { getTracer } from "@lmnr-ai/lmnr";
import { generateObject } from "ai";
import { z } from "zod";

import { getLanguageModel } from "@/lib/ai/model";

import { buildUserMessage, computeLayoutHints } from "./layout-hints";
import { captureLeaksWrapperTag, isStaticallyValid, patternBOnTrailingTag } from "./regex-guardrails";

const SYSTEM_PROMPT = `<role>
You write re2 regexes that strip scaffolding wrappers from a single AI agent
input message, leaving the instruction the agent was asked to act on. Agent
harnesses wrap the real instruction in XML-like tags (e.g. <system-reminder>,
<context>, <env>, <tool_list>, <user-prompt-submit-hook>, <skills>,
<reminder>, <metadata>, <session>, <EXTRA_INFO>, <issue_description>,
<research_findings>, <user_request>, <USER_QUERY>, <signal_description>,
or any similar tag a harness might invent). Remove the wrapper; keep the
instruction.
</role>

<how_to_decide>
You will be given the input text AND a <layout_hints> block computed from it.
The hints tell you observable structural facts: which tag names appear, which
balanced tag wraps the message, where prose sits relative to the tags. USE
THE HINTS. They are not optional context; they are the basis of your decision.

Map the hints to ONE of these five outputs. Pick the one that fits — do not
fall through to passthrough unless the hints say no wrapper is present.

  A) WRAPPED — instruction lives INSIDE a request-shaped tag.
     Hints: balanced tag whose name is request-shaped (user_request, task,
     query, user_query, USER_QUERY, user_instructions, signal_description,
     or similar — names that read like "this contains the request").
     Output: (?s)<TAG>\\s*(.*?)\\s*</TAG>

  B) LEADING — scaffolding wrapper at the top, instruction is the prose
     after the LAST closing tag.
     Hints: input STARTS with <TAG>, AND there is non-trivial prose after
     the last </TAG> in the input.
     Output: (?s).*</TAG>\\s*(.*)
     The leading ".*" is mandatory — it is greedy and forces the engine
     to skip every earlier </TAG> and anchor on the last one.

  C) NO_USER_REQUEST — entire input is scaffolding, no instruction present.
     Hints: input STARTS with <TAG> AND </TAG> is the last non-whitespace
     content (nothing meaningful after it). Or: input is a JSON schema /
     format spec only.
     Output: (?s)()

  D) TRAILING — instruction is prose at the top, scaffolding tag follows.
     Hints: input does NOT start with a tag, AND there is meaningful prose
     before the FIRST occurrence of the tag.
     Output: (?s)^(.*?)<TAG>
     The "^" pins to the start; lazy "(.*?)" stops at the first <TAG>.
     Use the FIRST opening tag — even if the wrapper is unclosed, this
     still strips correctly.

  E) PASSTHROUGH — only when no wrapper is detectable.
     Hints: no balanced harness wrapper, no leading wrapper, no trailing
     wrapper. The input is conversational prose, a bot comment, an issue
     body, or markdown rendered with HTML tags only (h1-h6, p, br, hr, a,
     div, span, strong, em, b, i, u, code, pre, blockquote, sub, sup,
     details, summary, table, img, ul, ol, li — these are CONTENT tags,
     never anchors).
     Output: (?s)(.*)
</how_to_decide>

<commit_to_a_choice>
The hints make the choice mechanical. Run through A→B→C→D→E in order
against the hints and stop at the first match. Do not deliberate beyond
that. Passthrough is for the genuinely tagless case at the bottom of the
list, not for "when in doubt."

If the hints say "starts_with_wrapper_tag: foo, ends_with_closing_tag: foo,
non_whitespace_after_last_close: 0" — that is C. Output (?s)().

If the hints say "starts_with_wrapper_tag: foo, non_whitespace_after_last_close: 142" —
that is B. Output (?s).*</foo>\\s*(.*).

If the hints say "starts_with_wrapper_tag: null, prose_chars_before_first_tag: 84,
first_tag: bar" — that is D. Output (?s)^(.*?)<bar>.

If the hints say "request_shaped_balanced_tag: USER_QUERY" — that is A.
Output (?s)<USER_QUERY>\\s*(.*?)\\s*</USER_QUERY>.

Only when the hints show no wrapper at all → E.
</commit_to_a_choice>

<layout_b_special_case>
Layout B (leading scaffolding) is the trickiest. When MULTIPLE wrapper
types stack at the top — e.g. <system_notes>...</system_notes><currently_viewing>...</currently_viewing>Hello —
the right anchor is the LAST closing tag of ANY wrapper, not the closing
tag that matches the OPENING. The hints surface this as
"last_closing_wrapper_tag" — use that name in your regex, not the first
one you saw.
</layout_b_special_case>

<request_shaped_vs_data_shaped>
Pattern A is for tags that wrap the user's request. Tags like:
  user_request, task, query, user_query, USER_QUERY, user_instructions,
  signal_description, or any name that reads "this is what the user wants."

NEVER apply Pattern A to data-wrapping tags. These wrap reference data,
not requests:
  research_findings, issue_description, EXTRA_INFO, context, spans,
  verification_results, draft_report, currently_viewing, system_notes.
A data tag with prose before it = Pattern D. A data tag at the start with
prose after = Pattern B. NEVER A.
</request_shaped_vs_data_shaped>

<one_anchor_only>
Use ONE literal tag name in your regex, never two different ones. A
two-anchor pattern like (?s).*</context>\\s*(.*)\\s*<final_instruction>
looks bounded but the inner (.*) is greedy and leaks across other wrapper
tags between them. If you find yourself wanting two anchors, you have
misread the layout — pick A or B with one anchor.

A pattern that uses both <X> and </X> for the SAME tag (Pattern A) is
fine — that is one anchor, used twice.
</one_anchor_only>

<output_format>
Return JSON: {"regex": "..."}
The regex starts with (?s), has exactly one capture group, and is one of
the five shapes above. No fences, no commentary.
</output_format>`;

const RegexResultSchema = z.object({
  regex: z
    .string()
    .nullable()
    .describe("A re2 regex pattern starting with (?s) with exactly one capture group, or null if none applies."),
});

const PASSTHROUGH = "(?s)(.*)";

export async function generateExtractionRegex(userMessage: string): Promise<string | null> {
  try {
    const hints = computeLayoutHints(userMessage);
    const wrappedPrompt = buildUserMessage(userMessage, hints);

    const { object } = await generateObject({
      model: getLanguageModel("lite"),
      system: SYSTEM_PROMPT,
      prompt: wrappedPrompt,
      schema: RegexResultSchema,
      maxRetries: 0,
      temperature: 0,
      abortSignal: AbortSignal.timeout(5000),
      experimental_telemetry: {
        isEnabled: true,
        tracer: getTracer(),
      },
    });

    const candidate = object.regex?.trim() || null;
    if (!candidate) return null;

    if (!isStaticallyValid(candidate)) return PASSTHROUGH;
    if (patternBOnTrailingTag(candidate, hints)) return PASSTHROUGH;

    return candidate;
  } catch {
    return null;
  }
}

export type ApplyRegexResult = { kind: "extracted"; text: string } | { kind: "no-user-request" } | { kind: "no-match" };

export function applyRegex(pattern: string, text: string): ApplyRegexResult {
  try {
    let flags = "";
    let cleanPattern = pattern;
    if (cleanPattern.startsWith("(?s)")) {
      flags = "s";
      cleanPattern = cleanPattern.slice(4);
    }
    const regex = new RegExp(cleanPattern, flags);
    const match = regex.exec(text);
    if (match && match[1] != null) {
      const extracted = match[1].trim();
      if (extracted.length > 0) {
        if (captureLeaksWrapperTag(extracted)) {
          return { kind: "extracted", text: text.trim() };
        }
        return { kind: "extracted", text: extracted };
      }
      return { kind: "no-user-request" };
    }
  } catch {
    // Invalid regex pattern
  }
  return { kind: "no-match" };
}
