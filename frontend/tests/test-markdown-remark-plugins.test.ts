import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MarkdownRenderer } from "@/components/ui/content-renderer/markdown";

/** Renders the real component, so these cover the whole chain the app uses:
 *  `markdownRemarkPlugins` -> Streamdown -> rehype sanitize/harden. In particular a
 *  regression in how Streamdown merges `remarkPlugins` (it replaces its defaults
 *  rather than merging, so gfm has to be re-added) shows up here as a missing table. */
const render = (markdown: string): string => renderToStaticMarkup(createElement(MarkdownRenderer, { value: markdown }));

/** Drop attributes so assertions read against structure, not Tailwind classes. */
const structure = (markdown: string): string => render(markdown).replace(/<(\/?[a-z0-9]+)[^>]*?(\/?)>/gi, "<$1$2>");

describe("markdown rendering of custom XML-like tags", () => {
  it("keeps paragraphs and newlines around a multi-line custom tag block", () => {
    const html = structure(
      [
        "Before the block.",
        "",
        '<prompt id="sp_82e0192b">',
        "line one",
        "line two",
        "</prompt>",
        "",
        "After the block.",
      ].join("\n")
    );

    // Three separate paragraphs: html-flow used to merge the tag block into one bare
    // text node in flow position, dropping the wrappers (and their margins) entirely.
    assert.equal(html.match(/<p>/g)?.length, 3);
    assert.match(html, /<p>Before the block\.<\/p>/);
    assert.match(html, /<p>After the block\.<\/p>/);
    // Tag survives as escaped text, and the newlines inside it survive as <br>.
    assert.match(
      html,
      /<p>&lt;prompt id=&quot;sp_82e0192b&quot;&gt;<br\/>\s*line one<br\/>\s*line two<br\/>\s*&lt;\/prompt&gt;<\/p>/
    );
  });

  it("still renders a GFM table in a document that also contains a custom tag", () => {
    const html = structure(["<prompt>", "", "| a | b |", "| --- | --- |", "| 1 | 2 |"].join("\n"));

    assert.match(html, /<table>/);
    assert.match(html, /<th>a<\/th>/);
    assert.match(html, /<td>1<\/td>/);
    assert.match(html, /&lt;prompt&gt;/);
  });

  it("renders an inline tag mid-paragraph without breaking surrounding markdown", () => {
    const html = structure("Use the <tool_call> tag with **bold** text.");

    assert.match(html, /<p>Use the &lt;tool_call&gt; tag with <span>bold<\/span> text\.<\/p>/);
  });

  it("leaves autolinks and fenced code blocks intact", () => {
    assert.match(render("See <https://example.com> here."), /<a[^>]*href="https:\/\/example\.com\/?"/);

    // The `code` override replaces Streamdown's lazy CodeBlock, so the code text is
    // present in static markup. remark-breaks must not inject <br> into it.
    const code = structure(["```ts", "const a = <T,>() => 1;", "const b = 2;", "```"].join("\n"));
    assert.match(code, /<code>const a = &lt;T,&gt;\(\) =&gt; 1;\nconst b = 2;\n<\/code>/);
    assert.doesNotMatch(code, /<br\/>/);
  });

  it("renders HTML comments as visible text", () => {
    // Intended tradeoff of disabling htmlFlow/htmlText: comments are no longer
    // swallowed by the parser, so they show up as escaped text instead of vanishing.
    const html = structure("Alpha\n\n<!-- hidden note -->\n\nBeta");

    assert.match(html, /<p>&lt;!-- hidden note --&gt;<\/p>/);
    assert.match(html, /<p>Alpha<\/p>/);
    assert.match(html, /<p>Beta<\/p>/);
  });

  it("turns single newlines into <br> instead of collapsing them to a space", () => {
    assert.match(structure("first line\nsecond line"), /<p>first line<br\/>\s*second line<\/p>/);
  });
});
