import assert from "node:assert/strict";
import { describe, it } from "node:test";

import rehypeStringify from "rehype-stringify";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

import { markdownRemarkPlugins } from "@/components/ui/content-renderer/remark-plugins";

/** Mirrors the pipeline Streamdown builds internally:
 *  remark-parse -> remarkPlugins -> remark-rehype -> rehypePlugins. */
const render = (markdown: string): string =>
  String(
    unified()
      .use(remarkParse)
      .use(markdownRemarkPlugins)
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeStringify, { allowDangerousHtml: true })
      .processSync(markdown)
  );

describe("markdownRemarkPlugins", () => {
  it("keeps paragraphs and newlines around a multi-line custom tag block", () => {
    const html = render(
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

    // Three separate paragraphs: html-flow would have merged the tag block into one
    // bare text node and dropped the wrappers entirely.
    assert.equal(html.match(/<p>/g)?.length, 3);
    assert.match(html, /<p>Before the block\.<\/p>/);
    assert.match(html, /<p>After the block\.<\/p>/);
    // Tag survives as escaped text, and the internal newlines survive as <br>.
    assert.match(html, /&#x3C;prompt id="sp_82e0192b">/);
    assert.match(html, /line one<br>\s*line two/);
    assert.match(html, /&#x3C;\/prompt>/);
  });

  it("still renders GFM tables in a document that also contains a custom tag", () => {
    const html = render(["<prompt>", "", "| a | b |", "| --- | --- |", "| 1 | 2 |"].join("\n"));

    assert.match(html, /<table>/);
    assert.match(html, /<th>a<\/th>/);
    assert.match(html, /<td>1<\/td>/);
    assert.match(html, /&#x3C;prompt>/);
  });

  it("renders an inline tag mid-paragraph without breaking the surrounding markdown", () => {
    const html = render("Use the <tool_call> tag with **bold** text.");

    assert.match(html, /<p>Use the &#x3C;tool_call> tag with <strong>bold<\/strong> text\.<\/p>/);
  });

  it("leaves autolinks and fenced code blocks intact", () => {
    const autolink = render("See <https://example.com> for details.");
    assert.match(autolink, /<a href="https:\/\/example\.com">https:\/\/example\.com<\/a>/);

    const code = render(["```ts", "const a = <T,>() => 1;", "```"].join("\n"));
    assert.match(code, /<pre><code class="language-ts">/);
    assert.match(code, /const a = &#x3C;T,>\(\) => 1;/);
    // No <br> injected inside code: remark-breaks only touches text nodes.
    assert.doesNotMatch(code, /<br>/);
  });

  it("renders HTML comments as visible text", () => {
    // Intended tradeoff of disabling htmlFlow/htmlText: comments are no longer
    // swallowed by the parser, so they show up as escaped text instead of vanishing.
    const html = render("Alpha\n\n<!-- hidden note -->\n\nBeta");

    assert.match(html, /<p>&#x3C;!-- hidden note --><\/p>/);
    assert.match(html, /<p>Alpha<\/p>/);
    assert.match(html, /<p>Beta<\/p>/);
  });

  it("turns single newlines into <br> instead of collapsing them to a space", () => {
    const html = render("first line\nsecond line");

    assert.match(html, /<p>first line<br>\s*second line<\/p>/);
  });
});
