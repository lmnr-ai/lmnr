import { getTracer } from "@lmnr-ai/lmnr";
import { generateText } from "ai";

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
    const { text } = await generateText({
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
    });

    const pattern = text
      .trim()
      .replace(/^[`"']+|[`"']+$/g, "")
      .trim();

    return pattern || null;
  } catch {
    return null;
  }
}

export function applyRegex(pattern: string, text: string): string | null {
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
      if (extracted.length > 0) return extracted;
    }
  } catch {
    // Invalid regex pattern
  }
  return null;
}
