import { getTracer } from "@lmnr-ai/lmnr";
import { generateText } from "ai";

import { getLanguageModel } from "@/lib/ai/model";

const SYSTEM_PROMPT = `You write re2 regexes to extract the user's actual request from AI agent conversation messages.

The text contains scaffolding blocks wrapped in XML tags mixed with the actual user request.

YOUR TASK: find where the user's actual request is and write a regex that captures ONLY that text.

There are two common patterns — pick the one that matches:

PATTERN A – The user request is INSIDE a dedicated tag (e.g. <user_request>, <user_message>, <query>).
Use this when you see a tag whose content is clearly the user's own words, surrounded by system/scaffolding tags.
Template: (?s)<tag>\\s*(.*?)\\s*</tag>
Examples:
- (?s)<user_request>\\s*(.*?)\\s*</user_request>
- (?s)<query>\\s*(.*?)\\s*</query>

PATTERN B – The user request is AFTER all scaffolding tags (the plain text at the end).
Use this when scaffolding tags wrap system context and the user request follows the last closing tag.
Template: (?s).*</tag>\\s*(.*)
Examples:
- (?s).*</system-reminder>\\s*(.*)
- (?s).*</context>\\s*(.*)

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
