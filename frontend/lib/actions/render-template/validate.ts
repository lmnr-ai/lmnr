import { parseExpression } from "@babel/parser";

import { normalizeTemplateCode } from "@/components/ui/template-renderer/normalize";

export interface TemplateValidationResult {
  ok: boolean;
  /** Human-readable syntax error (with 1-based line:col when available), or undefined when ok. */
  error?: string;
}

// Plan A: SYNTAX-ONLY validation. We parse the normalized template as a JSX
// arrow-function expression and confirm it IS a function. We deliberately do NOT
// execute the code (no server-side eval / vm) — runtime errors against real data
// are surfaced by the iframe preview instead. This parser mirrors the iframe's
// @babel transpile (jsx-renderer.tsx), so "parses here" == "parses in the sandbox".
export const validateTemplateCode = (code: string): TemplateValidationResult => {
  const trimmed = code?.trim();
  if (!trimmed) {
    return { ok: false, error: "Template code is empty." };
  }

  const normalized = normalizeTemplateCode(trimmed);

  try {
    const node = parseExpression(normalized, {
      plugins: ["jsx"],
      errorRecovery: false,
    });

    if (node.type !== "ArrowFunctionExpression" && node.type !== "FunctionExpression") {
      return { ok: false, error: "Template must be a function of the shape function({ data }) { ... }." };
    }

    return { ok: true };
  } catch (e) {
    // @babel/parser throws SyntaxError with a `.loc` { line, column } (0-based col).
    const err = e as { message?: string; loc?: { line: number; column: number } };
    const location = err.loc ? ` (line ${err.loc.line}, column ${err.loc.column + 1})` : "";
    const message = (err.message ?? "Invalid JSX syntax").replace(/\s*\(\d+:\d+\)\s*$/, "");
    return { ok: false, error: `${message}${location}` };
  }
};
