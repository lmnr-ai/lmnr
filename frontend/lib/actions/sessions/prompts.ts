import { getTracer, observe } from "@lmnr-ai/lmnr";
import { generateText } from "ai";

import { getLanguageModel } from "@/lib/ai/model";

const SYSTEM_PROMPT = `You write re2 regexes. You will receive one text sample. Write a regex that captures the core user request from it.

The text is a user message from an AI agent conversation. It may contain scaffolding such as XML tags, context sections, tool outputs, conversation history, etc. surrounding the actual user request. Your regex must capture ONLY the real user request/query/task.

Rules:
- Exactly one capture group (...) that matches the user's actual request.
- re2 only: no lookaheads, lookbehinds, backreferences.
- .*? for non-greedy, .* for greedy. Prefix (?s) if . must match newlines.
- If the text is already plain user input with no scaffolding, return: (?s)(.*)
- Return ONLY the regex. No explanation, no backticks, no quotes.`;

export async function generateExtractionRegex(userMessage: string): Promise<string | null> {
  try {
    const { text } = await observe({ name: "generate_trace_input_extraction_regex" }, async () =>
      generateText({
        model: getLanguageModel("lite"),
        system: SYSTEM_PROMPT,
        prompt: userMessage.slice(0, 6000),
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
      .replace(/^`+|`+$/g, "")
      .trim();

    return pattern || null;
  } catch {
    return null;
  }
}

export function applyRe2Regex(pattern: string, text: string): string | null {
  try {
    let flags = "";
    let cleanPattern = pattern;
    if (cleanPattern.startsWith("(?s)")) {
      flags = "s";
      cleanPattern = cleanPattern.slice(4);
    }
    const regex = new RegExp(cleanPattern, flags);
    const match = regex.exec(text);
    if (match?.[1] !== undefined) {
      const extracted = match[1].trim();
      if (extracted.length > 0) return extracted;
    }
  } catch {
    // Invalid regex pattern
  }
  return null;
}
