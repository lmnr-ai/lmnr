import { tool } from "ai";
import { z } from "zod";

import { validateTemplateCode } from "./validate";

export const TEMPLATE_FILE = "template.jsx";
export const FILTER_FILE = "filter.sql";

/** In-memory virtual filesystem the generation agent edits. One entry per file. */
export type Vfs = Record<string, string>;

/**
 * Builds the tool set the ToolLoopAgent uses to read/edit the virtual files and
 * syntax-check the template. Tools close over `vfs` (single per-request object),
 * so no `toolsContext` plumbing is needed. `allowedPaths` scopes writes to the
 * files the agent is allowed to touch (template.jsx, and filter.sql for trace).
 */
export const createVfsTools = (vfs: Vfs, allowedPaths: string[]) => {
  const assertPath = (path: string): string | null =>
    allowedPaths.includes(path) ? null : `Unknown file "${path}". Editable files: ${allowedPaths.join(", ")}.`;

  return {
    readFile: tool({
      description: "Read the current contents of a file.",
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path }) => {
        const err = assertPath(path);
        if (err) return { ok: false, error: err };
        return { ok: true, content: vfs[path] ?? "" };
      },
    }),

    writeFile: tool({
      description: "Overwrite a file with new contents.",
      inputSchema: z.object({ path: z.string(), content: z.string() }),
      execute: async ({ path, content }) => {
        const err = assertPath(path);
        if (err) return { ok: false, error: err };
        vfs[path] = content;
        return { ok: true };
      },
    }),

    strReplace: tool({
      description:
        "Replace the first exact occurrence of oldStr with newStr in a file. oldStr must appear exactly once.",
      inputSchema: z.object({ path: z.string(), oldStr: z.string(), newStr: z.string() }),
      execute: async ({ path, oldStr, newStr }) => {
        const err = assertPath(path);
        if (err) return { ok: false, error: err };
        const current = vfs[path] ?? "";
        const first = current.indexOf(oldStr);
        if (first === -1) return { ok: false, error: "oldStr not found in file." };
        if (current.indexOf(oldStr, first + oldStr.length) !== -1) {
          return {
            ok: false,
            error: "oldStr is ambiguous (appears more than once). Include more surrounding context.",
          };
        }
        vfs[path] = current.slice(0, first) + newStr + current.slice(first + oldStr.length);
        return { ok: true };
      },
    }),

    validate: tool({
      description: "Syntax-check template.jsx. Returns { ok, error }. Call this before finishing.",
      inputSchema: z.object({}),
      execute: async () => validateTemplateCode(vfs[TEMPLATE_FILE] ?? ""),
    }),
  };
};
