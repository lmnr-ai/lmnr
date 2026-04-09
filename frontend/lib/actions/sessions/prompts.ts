import { getTracer, observe } from "@lmnr-ai/lmnr";
import { generateText } from "ai";
import { RE2JS } from "re2js";

import { getLanguageModel } from "@/lib/ai/model";

const SYSTEM_PROMPT = `You write re2 regexes to extract the user's actual request from AI agent conversation messages.

The text contains scaffolding blocks wrapped in XML tags (like <system-reminder>...</system-reminder>, <context>...</context>, etc.) mixed with the actual user request. The user request is the text NOT inside any XML tag block.

YOUR TASK: identify the XML tag name used for scaffolding blocks, then write a regex that skips past ALL of them and captures only the non-scaffolding text after the last block.

STRATEGY:
- Find the closing tag name from the scaffolding (e.g. </system-reminder>)
- Use greedy .* to skip to the LAST occurrence of that closing tag
- Capture everything after it

TEMPLATE (replace "tag" with the actual tag name):
(?s).*</tag>\\s*(.*)

EXAMPLES:
- If scaffolding uses <system-reminder> tags → (?s).*</system-reminder>\\s*(.*)
- If scaffolding uses <context> tags → (?s).*</context>\\s*(.*)

RULES:
- Exactly one capture group that gets the user's actual request.
- re2 only: no lookaheads, lookbehinds, backreferences.
- Always prefix with (?s) so . matches newlines.
- If there is no scaffolding (no XML tag blocks), return: (?s)(.*)
- Return ONLY the regex, nothing else.`;

export async function generateExtractionRegex(userMessage: string): Promise<string | null> {
  try {
    const { text } = await observe({ name: "generate_trace_input_extraction_regex" }, async () =>
      generateText({
        model: getLanguageModel("lite"),
        system: SYSTEM_PROMPT,
        prompt: userMessage,
        maxRetries: 0,
        temperature: 0,
        abortSignal: AbortSignal.timeout(5000),
        experimental_telemetry: {
          isEnabled: true,
          tracer: getTracer(),
        },
      })
    );

    const pattern = text
      .trim()
      .replace(/^[`"']+|[`"']+$/g, "")
      .trim();

    return pattern || null;
  } catch {
    return null;
  }
}

export function applyRe2Regex(pattern: string, text: string): string | null {
  try {
    let flags = 0;
    let cleanPattern = pattern;
    if (cleanPattern.startsWith("(?s)")) {
      flags = RE2JS.DOTALL;
      cleanPattern = cleanPattern.slice(4);
    }
    const regex = RE2JS.compile(cleanPattern, flags);
    const matcher = regex.matcher(text);
    if (matcher.find()) {
      const group = matcher.group(1);
      if (group !== null) {
        const extracted = group.trim();
        if (extracted.length > 0) return extracted;
      }
    }
  } catch {
    // Invalid regex pattern (RE2JS rejects unsafe patterns at compile time)
  }
  return null;
}
