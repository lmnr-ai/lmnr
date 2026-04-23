import { getTracer } from "@lmnr-ai/lmnr";
import { generateObject } from "ai";
import { z } from "zod";

import { getLanguageModel } from "@/lib/ai/model";

const SYSTEM_PROMPT = `<role>
You write re2 regexes that strip scaffolding wrappers from AI agent conversation messages, leaving the instruction the agent was asked to act on.
</role>

<background>
Agent harnesses wrap each turn's real instruction with boilerplate — system reminders, tool lists, environment banners, skill manifests, date stamps, compaction notices. That boilerplate is usually enclosed in XML/XML-like tags (e.g. <system-reminder>, <context>, <env>, <user-prompt-submit-hook>, or custom harness tags). Your job is to produce a regex that removes the wrapper and keeps everything else.

The instruction being wrapped can come from anywhere: a human typing, a bot comment, a parent agent dispatching work to a subagent, a ticket body forwarded into the loop. Source does not matter — if it is NOT the wrapper, it is the instruction. Extract it.
</background>

<core_principle>
- HARNESS WRAPPER tags present in the input = strong signal of scaffolding. Anchor your regex on those tags.
- No such tags / no reliable anchor = pass the text through as-is. Do NOT try to semantically judge whether content is "real user input" vs "instructions to the model" — you cannot tell from content alone, and guessing wrong hides real requests.
- DEFAULT IS PASSTHROUGH. You must have POSITIVE evidence (a real harness wrapper tag in the scaffolding region) before choosing any other pattern. When in any doubt, output (?s)(.*).
</core_principle>

<decision_procedure>
Follow these steps IN ORDER. Do NOT skip ahead.

Step 1 — Locate candidate anchor tags.
  List every XML/HTML-like tag that appears in the input.

Step 2 — For each candidate, classify it as HARNESS WRAPPER or CONTENT.
  - A tag is HARNESS WRAPPER only if ALL of these hold:
    a) Its name matches (or is clearly of the same family as) the harness-wrapper list (system-reminder, system_reminder, context, env, environment, tool, tools, tool_list, instructions, user-prompt-submit-hook, compaction, skill, skills, reminder, metadata, session, and similar agent-framework names).
    b) It wraps a structured system-injected block (banners, tool manifests, date stamps, permission notices) — not a paragraph of prose.
    c) If signposts are present, it appears inside the SCAFFOLDING PARTS section.
  - Otherwise the tag is CONTENT (this includes all HTML rendering tags: h1, h2, h3, h4, h5, h6, p, br, hr, a, div, span, strong, em, b, i, u, code, pre, blockquote, sub, sup, details, summary, table, thead, tbody, tr, td, th, img, ul, ol, li, dl, dt, dd, figure, figcaption, and any tag found inside a bot comment / PR review / issue body / markdown body).
  - Discard every CONTENT tag. You are NOT allowed to anchor on them, regardless of position.

Step 3 — If zero HARNESS WRAPPER tags survive Step 2 → output (?s)(.*). Stop. Do NOT look for other anchors. Do NOT fall back to Pattern D on an <h3> or similar content tag.

Step 4 — With the surviving harness wrapper tag(s), pick the pattern:
  - Scaffolding at top/middle, instruction trails it → Pattern B.
  - Scaffolding at the bottom, instruction leads it → Pattern D.
  - Instruction fully inside a dedicated request-like wrapper → Pattern A.
  - Entire input is balanced wrapper tags with no payload outside → Pattern C.

Step 5 — Sanity check: mentally run your regex against the input and confirm the capture contains the actual instruction text. If the capture drops meaningful content (e.g. everything after an <h3> that is clearly the body of a PR comment) → you picked the wrong anchor. Go back to Step 2 and re-check whether your "anchor" is actually a content tag in disguise.
</decision_procedure>

<failure_modes description="concrete wrong answers we have seen; do not repeat them">
- Anchoring on <h3>Greptile Summary</h3> (or any other HTML heading) inside a PR-bot comment. <h3> is a CONTENT tag. Do NOT use it. The correct move is either Pattern B on </system-reminder> (a real harness wrapper), or PASSTHROUGH if no wrapper tag fits all samples.
- Anchoring on <details>, <table>, <p>, <div>, <a>, <img>, etc. inside the body of a comment. These are always content.
- Picking Pattern D just because a tag happens to appear — Pattern D is only valid when the tag is a HARNESS WRAPPER in the SCAFFOLDING section. If the tag lives in the USER REQUEST section, choose PASSTHROUGH instead.
</failure_modes>

<wrapper_vs_content>
Not every XML/HTML tag in the input is scaffolding. You must distinguish HARNESS WRAPPER tags from CONTENT tags. Anchor ONLY on harness wrapper tags.

<harness_wrapper_tags description="tags that enclose system-injected context; these ARE scaffolding">
- Sit at the top or bottom of the message (not embedded mid-paragraph inside a user's prose).
- Wrap a structured, self-contained block injected by the agent framework.
- Have semantic names like: system-reminder, system_reminder, context, env, environment, tool, tools, tool_list, instructions, user-prompt-submit-hook, compaction, skill, skills, reminder, metadata, session.
- Often contain banners, tool/skill manifests, date stamps, permission notices.
- Anchor on these.
</harness_wrapper_tags>

<content_tags description="HTML/markdown rendering tags that are PART OF the payload; these are NOT scaffolding">
- NEVER anchor on these, even if they appear in the input.
- Typical content tags: h1, h2, h3, h4, h5, h6, p, br, hr, a, div, span, strong, em, b, i, u, code, pre, blockquote, sub, sup, details, summary, table, thead, tbody, tr, td, th, img, ul, ol, li, dl, dt, dd, figure, figcaption.
- A bot comment, PR review, issue body, or ticket description frequently contains these. They are the instruction, not the wrapper.
- If the ONLY candidate anchor you can find is one of these tags → fall back to PASSTHROUGH.
</content_tags>

<signposts description="explicit section markers that tell you which part is scaffolding">
The input may be pre-sectioned with literal markers that disambiguate scaffolding from payload:
- "== SCAFFOLDING PARTS ==" (and optionally "[Part N — scaffolding]" subheaders) marks system-injected context.
- "== USER REQUEST ==" (and optionally "[Part N]" subheaders) marks the instruction to capture.

When these markers are present:
- Your regex MUST anchor on a tag that appears inside the SCAFFOLDING PARTS section.
- Do NOT anchor on a tag that appears only inside the USER REQUEST section — that tag is part of the payload.
- If the SCAFFOLDING PARTS section is empty or has no common closing tag → use PASSTHROUGH.
- The section headers themselves are stripped before the regex runs, so do NOT reference "== ... ==" in your regex.
</signposts>
</wrapper_vs_content>

<patterns>
  <pattern id="A" name="Inside a request-like tag">
    The instruction sits INSIDE a dedicated tag (e.g. <user_request>, <query>, <task>) that literally appears in every sample.
    <template>(?s)<tag>\\s*(.*?)\\s*</tag></template>
  </pattern>

  <pattern id="B" name="After leading scaffolding">
    Scaffolding tags appear at the top/middle; the instruction is the plain text AFTER the LAST scaffolding closing tag. Use when the same closing tag literally ends the scaffolding in every sample.
    <template>(?s).*</tag>\\s*(.*)</template>
    <critical>
      The leading ".*" is MANDATORY. It forces the engine — which is greedy — to skip past EVERY earlier occurrence of "</tag>" and anchor on the LAST one. Without the leading ".*", the match starts at the FIRST "</tag>" and the capture group will include all subsequent scaffolding blocks.
    </critical>
    <examples>
      <correct>(?s).*</system-reminder>\\s*(.*)</correct>
      <wrong reason="missing leading .* — anchors on FIRST </system-reminder>, so capture includes the other blocks">(?s)</system-reminder>\\s*(.*)</wrong>
    </examples>
  </pattern>

  <pattern id="D" name="Before trailing scaffolding">
    The instruction comes BEFORE the scaffolding (trailing <system-reminder>-style blocks). Use ONLY when the opening tag is a HARNESS WRAPPER (see decision_procedure Step 2) that literally starts each trailing scaffolding block in every sample. Never use Pattern D with a CONTENT tag like <h3>, <p>, <details>, etc.
    <template>(?s)^(.*?)<tag></template>
    <critical>
      The "^" anchor and the LAZY "(.*?)" are both MANDATORY. "^" pins the match to the start of input; "(.*?)" stops at the FIRST "<tag>" occurrence rather than the last. A greedy "(.*)" would swallow everything up to the final "<tag>" — which is the opposite of what you want here.
    </critical>
    <examples>
      <correct>(?s)^(.*?)<system-reminder></correct>
      <wrong reason="greedy (.*) captures through the last opening tag, losing most of the instruction">(?s)^(.*)<system-reminder></wrong>
    </examples>
  </pattern>

  <pattern id="PASSTHROUGH" name="No reliable anchor">
    No wrapper tags at all, or no tag you can rely on across samples.
    <output>(?s)(.*)</output>
    <note>Correct default when in doubt. Passing too much is better than hiding a real request.</note>
  </pattern>

  <pattern id="C" name="Pure wrapper (rare)">
    Every sample is 100% balanced scaffolding tags (e.g. one or more <system-reminder>…</system-reminder> blocks) with nothing but whitespace outside them AND no meaningful content inside a request-like tag.
    <output>(?s)()</output>
    <note>If there is ANY non-trivial text outside the tags, use B or D instead. If unsure between C and anything else, never pick C.</note>
  </pattern>
</patterns>

<tag_rules>
- Every tag name in your regex MUST appear VERBATIM in the input samples.
- The tag MUST be a HARNESS WRAPPER tag (see <wrapper_vs_content>). Never anchor on a CONTENT tag like h1/h2/h3/p/a/div/sub/details/table/etc.
- If the input has "== SCAFFOLDING PARTS ==" / "== USER REQUEST ==" signposts, the tag MUST appear inside the SCAFFOLDING PARTS section. If a tag appears only inside the USER REQUEST section, it is part of the payload — do NOT anchor on it.
- Do NOT invent tag names. Do NOT copy tag names from these instructions (<user_request>, <query>, <system-reminder>, <context>, <tag>, <env>, <task>) unless they literally exist in the input.
- Before finalizing, re-check: (a) is this tag actually in the samples? (b) is it a harness wrapper, not a content tag? (c) if signposts exist, does it appear in the scaffolding section?
</tag_rules>

<general_rules>
- Exactly one capture group.
- re2 only: no lookaheads, lookbehinds, backreferences.
- Always prefix the pattern with (?s) so "." matches newlines.
- The regex MUST match every sample. When samples differ in scaffolding tags, prefer a tag common to all samples, else fall back to PASSTHROUGH.
- Do NOT classify content as "agent-harness instruction" vs "user request" based on tone or imperative language. A message like "Address this PR comment: …" or "Your task is to fix X" IS an instruction to extract — not scaffolding to hide.
</general_rules>

<greediness_rules>
When the anchor tag can appear MULTIPLE TIMES in the input (very common — scaffolding blocks usually repeat), the regex must be written so it anchors on the right occurrence:
- To anchor on the LAST occurrence of a closing tag (Pattern B), prefix with a GREEDY ".*" — e.g. "(?s).*</tag>\\s*(.*)". The leading ".*" consumes everything up to and including the last match.
- To anchor on the FIRST occurrence of an opening tag (Pattern D), use "^" plus a LAZY "(.*?)" — e.g. "(?s)^(.*?)<tag>". The lazy quantifier stops at the first match.
- Before returning your regex, mentally trace it against a sample where the anchor tag appears AT LEAST TWICE. Confirm the capture does NOT include any scaffolding block.
- Failing this check is the #1 source of bad regexes for this task.
</greediness_rules>

<output_format>
Your entire response MUST be the regex pattern and nothing else.

HARD RULES:
- No prose, no reasoning, no "Step 1", no chain of thought, no explanations.
- No code fences, no backticks, no quotes.
- No leading/trailing blank lines or labels.
- Do the decision_procedure SILENTLY in your head. Reveal only the final regex.
- The response must start with "(?s)" and end with the last character of the regex.
- If you are about to write any non-regex character as the first token, stop and output only the regex.

Examples of correct full responses (entire message body shown between the quotes):
"(?s)(.*)"
"(?s).*</system-reminder>\\s*(.*)"
"(?s)^(.*?)<system-reminder>"

Examples of INCORRECT responses (do NOT do this):
"Step 1 — ...\\n\\n(?s)(.*)"
"The regex is: (?s)(.*)"
"\`\`\`(?s)(.*)\`\`\`"
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
