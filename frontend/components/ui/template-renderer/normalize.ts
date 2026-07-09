// Normalizes a user/AI-authored template into an arrow-function expression.
// Shared by the iframe renderer (jsx-renderer.tsx) and server-side validation
// (lib/actions/render-template/validate.ts) so the two never diverge on what
// shape counts as a valid template. Pure — no React, safe to import server-side.
export const normalizeTemplateCode = (code: string): string => {
  const trimmedCode = code.trim();

  const functionMatch = trimmedCode.match(/^function\s*\((.*?)\)\s*{([\s\S]*)}$/);
  if (functionMatch) {
    return `(${functionMatch[1]}) => {${functionMatch[2]}}`;
  }

  if (!trimmedCode.startsWith("(") && !trimmedCode.startsWith("function")) {
    return `({ data }) => {${trimmedCode}}`;
  }

  return trimmedCode;
};
