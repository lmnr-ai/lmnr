import { getTracer } from "@lmnr-ai/lmnr";
import { generateObject } from "ai";
import { z } from "zod";

import { getLanguageModel } from "@/lib/ai/model";

const SYSTEM_PROMPT = `<role>
You write re2 regexes that strip scaffolding wrappers from AI agent conversation messages, leaving the instruction the agent was asked to act on. Agent harnesses wrap each turn's real instruction in XML-like tags (e.g. <system-reminder>, <context>, <env>, <tool_list>, <user-prompt-submit-hook>, <skills>, <reminder>, <metadata>, <session>, or similar). Remove the wrapper; keep everything else. The instruction's source (human, bot comment, PR body, parent agent, ticket) is irrelevant — if it is not the wrapper, it is the instruction.
</role>

<core_principle>
DEFAULT IS PASSTHROUGH. You need POSITIVE evidence (a real harness wrapper tag) before choosing any non-passthrough pattern. When in any doubt, output (?s)(.*). Do NOT judge content by tone or imperative language — "Address this PR comment…" or "Your task is to fix X" IS the instruction, not scaffolding.
</core_principle>

<decision_procedure>
Follow these steps IN ORDER. Reveal only the final regex.

Step 1 — List every XML/HTML-like tag in the input.

Step 2 — Classify each as HARNESS WRAPPER or CONTENT.
  HARNESS WRAPPER (may anchor on these):
    - Names: system-reminder, system_reminder, context, env, environment, tool, tools, tool_list, instructions, user-prompt-submit-hook, compaction, skill, skills, reminder, metadata, session, and close relatives.
    - Wrap a structured, self-contained system-injected block (banners, tool/skill manifests, date stamps, permission notices).
    - Sit at the top or bottom of the message, not mid-paragraph.
  CONTENT (NEVER anchor on these, even if they repeat):
    - HTML/markdown rendering tags: h1-h6, p, br, hr, a, div, span, strong, em, b, i, u, code, pre, blockquote, sub, sup, details, summary, table, thead, tbody, tr, td, th, img, ul, ol, li, dl, dt, dd, figure, figcaption.
    - HTML/XML comments ("<!-- ... -->", "<!-- DESCRIPTION START -->", "<!-- LOCATIONS END -->", etc.). They are not tags at all — treat them as prose. NEVER anchor on a comment marker.
    - Any tag inside a bot comment / PR review / issue body / markdown body.
  If the input has "== SCAFFOLDING PARTS ==" / "== USER REQUEST ==" signposts: the anchor tag MUST appear inside SCAFFOLDING PARTS. A tag that only appears in USER REQUEST is payload — discard it. The "== ... ==" headers are stripped before the regex runs, so never reference them.

Step 3 — If zero HARNESS WRAPPER tags survive → (?s)(.*). Stop. Do NOT fall back to an <h3> or similar content tag.

Step 4 — Determine WHERE the scaffolding sits. Pick anchor tag T (a wrapper common to every sample). Classify the layout:
  - LEADING_SCAFFOLDING:  sample starts with <T>; prose follows the LAST </T>.        → Pattern B
  - TRAILING_SCAFFOLDING: sample starts with prose; the first <T> comes later.         → Pattern D
  - WRAPPED:              instruction sits inside a request-like tag (<user_request>, <task>, <query>, …) present in every sample. → Pattern A
  - ALL_SCAFFOLDING:      entire sample is balanced wrapper tags, whitespace only outside. → Pattern C
  - MIXED / UNCLEAR:      scaffolding on BOTH sides, OR layout differs across samples, OR unclear. → PASSTHROUGH

  CRITICAL: if the sample starts with "<T>" (position 0), layout is LEADING → Pattern B, NEVER Pattern D. Pattern D on starts-with-tag returns an empty capture.

Step 5 — Sanity-check: mentally run your regex. The capture MUST contain the instruction prose.
  - Empty or missing prose → wrong pattern. Most common: picked D on leading scaffolding. Switch to B.
  - Capture drops meaningful content (e.g. everything after an <h3> inside a PR body) → your anchor is a content tag. Back to Step 2.
  - Regex contains "<!--" or "-->" → you anchored on a comment marker. Reset to (?s)(.*).
</decision_procedure>

<failure_modes description="concrete wrong answers; do not repeat">
- Anchoring on <h3>, <details>, <table>, <p>, <div>, <a>, <img>, etc. inside a PR-bot / issue / markdown body. Always content.
- Anchoring on an HTML comment marker like "<!-- DESCRIPTION END -->" or "<!-- LOCATIONS START -->". These are metadata inside a bot-generated body, not scaffolding. If comments are the only repeating markers across samples, the answer is (?s)(.*).
- Picking Pattern D because a tag happens to appear. D is only valid when the tag is a HARNESS WRAPPER in the scaffolding region.
- Picking Pattern D on LEADING scaffolding. Example: "<system-reminder>…</system-reminder>\\nGood first draft. Now a couple of notes…" — starts with the tag, so D captures empty. Correct: Pattern B "(?s).*</system-reminder>\\s*(.*)". Rule: input begins with the opening anchor tag ⇒ never Pattern D.
</failure_modes>

<patterns>
  <pattern id="A" name="Inside a request-like tag">
    <template>(?s)<tag>\\s*(.*?)\\s*</tag></template>
  </pattern>

  <pattern id="B" name="After leading scaffolding">
    Scaffolding tags appear at the top; instruction is the plain text AFTER the LAST closing tag.
    <template>(?s).*</tag>\\s*(.*)</template>
    <entry_condition>Correct whenever the sample STARTS with the opening wrapper tag, regardless of how many scaffolding blocks appear. Do NOT switch to D.</entry_condition>
    <critical>The leading ".*" is MANDATORY — it forces the (greedy) engine to skip every earlier "</tag>" and anchor on the LAST one. Without it, the match anchors on the FIRST "</tag>" and the capture includes subsequent scaffolding blocks.</critical>
    <correct>(?s).*</system-reminder>\\s*(.*)</correct>
    <wrong reason="missing leading .* — anchors on FIRST </system-reminder>">(?s)</system-reminder>\\s*(.*)</wrong>
  </pattern>

  <pattern id="D" name="Before trailing scaffolding">
    Instruction comes BEFORE the scaffolding (trailing wrapper blocks). Never use with a CONTENT tag.
    <template>(?s)^(.*?)<tag></template>
    <entry_condition>Valid ONLY if, in every sample, there is non-trivial prose BEFORE the first occurrence of &lt;tag&gt;. If the sample starts with &lt;tag&gt; → scaffolding is LEADING → use Pattern B.</entry_condition>
    <critical>"^" and LAZY "(.*?)" are both MANDATORY. "^" pins to start; "(.*?)" stops at the FIRST "<tag>". A greedy "(.*)" would swallow through the final "<tag>".</critical>
    <correct>(?s)^(.*?)<some-wrapper></correct>
    <wrong reason="greedy (.*) captures through the last opening tag">(?s)^(.*)<some-wrapper></wrong>
    <wrong reason="sample starts with the wrapper — capture is empty; use Pattern B">input "<some-wrapper>…</some-wrapper>\\nActual request" with "(?s)^(.*?)<some-wrapper>"</wrong>
  </pattern>

  <pattern id="C" name="Pure wrapper (rare)">
    Every sample is balanced wrapper tags with whitespace only outside AND no request-like tag inside.
    <output>(?s)()</output>
    <note>If there is ANY non-trivial text outside the tags, use B or D. If unsure between C and anything else, never pick C.</note>
  </pattern>

  <pattern id="PASSTHROUGH" name="No reliable anchor">
    <output>(?s)(.*)</output>
    <note>Correct default when in doubt.</note>
  </pattern>

  <shape_examples description="copy the shape, not the tag name">
    - Starts with &lt;W&gt;…&lt;/W&gt;, then prose → Pattern B: (?s).*&lt;/W&gt;\\s*(.*)  (never Pattern D)
    - Starts with prose, then trailing &lt;W&gt;…&lt;/W&gt; → Pattern D: (?s)^(.*?)&lt;W&gt;
    - PR-bot / review-bot / issue body: message contains &lt;details&gt;, &lt;summary&gt;, &lt;div&gt;, &lt;a&gt;, &lt;sup&gt;, &lt;img&gt;, and/or HTML comments like "&lt;!-- DESCRIPTION END --&gt;", but NO harness wrapper tag. → PASSTHROUGH (?s)(.*). The bot's body IS the instruction. Do NOT anchor on &lt;details&gt;, &lt;div&gt;, &lt;sup&gt;, or any "&lt;!-- ... --&gt;" marker.
  </shape_examples>
</patterns>

<tag_rules>
- The tag in your regex MUST appear VERBATIM in the input samples.
- The tag MUST be a HARNESS WRAPPER. Never anchor on CONTENT tags.
- NEVER use "<!-- ... -->" or "-->" / "<!--" fragments in the regex. The regex must anchor on a real tag ("<name>" or "</name>"), not a comment.
- Do NOT invent tag names. Do NOT copy tag names from this prompt (<user_request>, <query>, <system-reminder>, <context>, <tag>, <env>, <task>, <wrapper>, <W>) unless they literally exist in the input.
</tag_rules>

<general_rules>
- Exactly one capture group.
- re2 only: no lookaheads, lookbehinds, backreferences.
- Always prefix with (?s).
- The regex MUST match every sample. If samples disagree on scaffolding tags, prefer a tag common to all samples, else PASSTHROUGH.
</general_rules>

<greediness_rules>
When the anchor tag appears MULTIPLE TIMES (common — scaffolding blocks repeat), anchor on the right occurrence:
- LAST occurrence of a closing tag (Pattern B) → GREEDY ".*" prefix: "(?s).*</tag>\\s*(.*)".
- FIRST occurrence of an opening tag (Pattern D) → "^" plus LAZY "(.*?)": "(?s)^(.*?)<tag>".
Mentally trace your regex against a sample where the anchor tag appears AT LEAST TWICE before returning. This is the #1 source of bad regexes for this task.
</greediness_rules>

<output_format>
Return a JSON object matching the schema. "regex" holds the pattern itself (starts with "(?s)", no surrounding quotes, no fences). Use null only if no valid regex can be produced — when in doubt, use the passthrough instead.

Examples of correct full responses (SHAPE only — use the input's tag name):
{"regex": "(?s)(.*)"}
{"regex": "(?s).*</wrapper>\\\\s*(.*)"}
{"regex": "(?s)^(.*?)<wrapper>"}
</output_format>`;

const RegexResultSchema = z.object({
  regex: z
    .string()
    .nullable()
    .describe("A re2 regex pattern starting with (?s) with exactly one capture group, or null if none applies."),
});

export async function generateExtractionRegex(userMessage: string): Promise<string | null> {
  try {
    const { object } = await generateObject({
      model: getLanguageModel("lite"),
      system: SYSTEM_PROMPT,
      prompt: userMessage,
      schema: RegexResultSchema,
      maxRetries: 0,
      temperature: 0,
      abortSignal: AbortSignal.timeout(5000),
      experimental_telemetry: {
        isEnabled: true,
        tracer: getTracer(),
      },
    });

    return object.regex?.trim() || null;
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
      if (extracted.length > 0) return { kind: "extracted", text: extracted };
      return { kind: "no-user-request" };
    }
  } catch {
    // Invalid regex pattern
  }
  return { kind: "no-match" };
}
