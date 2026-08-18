import remarkBreaks from "remark-breaks";
import { defaultRemarkPlugins } from "streamdown";
import type { Plugin } from "unified";

/**
 * Parse XML-like tags (`<prompt>`, `<thinking>`) as ordinary character data.
 * Micromark's html-flow rule otherwise swallows everything from the opening tag to
 * the next blank line into one node, so newlines, paragraphs and any markdown inside
 * the block are lost before mdast is built. Tradeoff: HTML comments become visible text.
 */
const remarkDisableHtml: Plugin = function () {
  // `micromarkExtensions` is declared by remark-parse's `unified.Data` augmentation,
  // which isn't in scope here — remark-parse is only a transitive dep of streamdown.
  const data = this.data() as unknown as { micromarkExtensions?: unknown[] };
  const extensions = (data.micromarkExtensions ??= []);
  extensions.push({ disable: { null: ["htmlFlow", "htmlText"] } });
};

// Streamdown's `remarkPlugins` prop REPLACES its defaults, so gfm must be re-added
// explicitly or tables silently stop rendering.
export const markdownRemarkPlugins = [defaultRemarkPlugins.gfm, remarkBreaks, remarkDisableHtml];
