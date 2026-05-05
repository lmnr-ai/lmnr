import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildUserMessage, computeLayoutHints } from "@/lib/actions/sessions/layout-hints";
import { applyRegex } from "@/lib/actions/sessions/prompts";
import {
  captureLeaksWrapperTag,
  isStaticallyValid,
  patternBOnTrailingTag,
} from "@/lib/actions/sessions/regex-guardrails";

const STACKED_REMINDERS_INPUT = `<system-reminder>tool list 1</system-reminder>
<system-reminder>skills list</system-reminder>
<system-reminder>date stamp</system-reminder>

Lead intake from the lead enrichment pipeline.
Lead id: lead:abc123`;

describe("computeLayoutHints", () => {
  it("classifies stacked leading reminders as Pattern B (LEADING)", () => {
    const hints = computeLayoutHints(STACKED_REMINDERS_INPUT);
    assert.strictEqual(hints.startsWithTag, "system-reminder");
    assert.strictEqual(hints.endsWithClosingTag, null);
    assert.strictEqual(hints.firstTag, "system-reminder");
    assert.strictEqual(hints.lastClosingTag, "system-reminder");
    assert.strictEqual(hints.proseLengthBeforeFirstTag, 0);
    assert.ok(hints.charsAfterLastClose > 0);
    assert.deepStrictEqual(hints.balancedTags, ["system-reminder"]);
    assert.strictEqual(hints.requestShapedTag, null);
  });

  it("classifies request-shaped wrapping as Pattern A", () => {
    const text = "<USER_QUERY>What is the weather?</USER_QUERY>";
    const hints = computeLayoutHints(text);
    assert.strictEqual(hints.startsWithTag, "USER_QUERY");
    assert.strictEqual(hints.endsWithClosingTag, "USER_QUERY");
    assert.strictEqual(hints.requestShapedTag, "USER_QUERY");
    assert.deepStrictEqual(hints.balancedTags, ["USER_QUERY"]);
  });

  it("classifies trailing scaffolding as Pattern D (prose before first tag)", () => {
    const text = "Please summarise this report.\n<context>internal data</context>";
    const hints = computeLayoutHints(text);
    assert.strictEqual(hints.startsWithTag, null);
    assert.strictEqual(hints.firstTag, "context");
    assert.ok(hints.proseLengthBeforeFirstTag > 0);
  });

  it("classifies all-scaffolding as Pattern C", () => {
    const text = "<system-reminder>only scaffolding here</system-reminder>";
    const hints = computeLayoutHints(text);
    assert.strictEqual(hints.startsWithTag, "system-reminder");
    assert.strictEqual(hints.endsWithClosingTag, "system-reminder");
    assert.strictEqual(hints.charsAfterLastClose, 0);
  });

  it("classifies markdown-only PR body as Pattern E (passthrough)", () => {
    const text = "<details><summary>info</summary><p>Body text here</p></details>";
    const hints = computeLayoutHints(text);
    assert.deepStrictEqual(hints.balancedTags, []);
    assert.strictEqual(hints.firstTag, null);
    assert.strictEqual(hints.requestShapedTag, null);
  });

  it("filters HTML content tags from balanced wrappers", () => {
    const text = "<details><div>x</div></details><h3>title</h3><p>p</p>";
    const hints = computeLayoutHints(text);
    assert.deepStrictEqual(hints.balancedTags, []);
  });

  it("handles stacked mixed wrapper types — last_closing_wrapper_tag is the rightmost", () => {
    const text = "<system_notes>...</system_notes><currently_viewing>data</currently_viewing>Hello world prose";
    const hints = computeLayoutHints(text);
    assert.strictEqual(hints.startsWithTag, "system_notes");
    assert.strictEqual(hints.lastClosingTag, "currently_viewing");
    assert.ok(hints.charsAfterLastClose > 0);
  });
});

describe("buildUserMessage", () => {
  it("formats hints and input verbatim", () => {
    const hints = computeLayoutHints(STACKED_REMINDERS_INPUT);
    const wrapped = buildUserMessage(STACKED_REMINDERS_INPUT, hints);
    assert.match(wrapped, /^<layout_hints>$/m);
    assert.match(wrapped, /^starts_with_wrapper_tag: system-reminder$/m);
    assert.match(wrapped, /^ends_with_closing_tag: null$/m);
    assert.match(wrapped, /^last_closing_wrapper_tag: system-reminder$/m);
    assert.match(wrapped, /^balanced_tags_present: system-reminder$/m);
    assert.match(wrapped, /^request_shaped_balanced_tag: null$/m);
    assert.match(wrapped, /^<\/layout_hints>$/m);
    assert.ok(wrapped.includes("<input>\n" + STACKED_REMINDERS_INPUT + "\n</input>"));
  });

  it("emits 'none' for empty balanced_tags", () => {
    const hints = computeLayoutHints("just plain prose, no tags");
    const wrapped = buildUserMessage("just plain prose, no tags", hints);
    assert.match(wrapped, /^balanced_tags_present: none$/m);
  });
});

describe("isStaticallyValid", () => {
  it("accepts the five canonical shapes", () => {
    assert.ok(isStaticallyValid("(?s)(.*)"));
    assert.ok(isStaticallyValid("(?s)()"));
    assert.ok(isStaticallyValid("(?s).*</system-reminder>\\s*(.*)"));
    assert.ok(isStaticallyValid("(?s)^(.*?)<context>"));
    assert.ok(isStaticallyValid("(?s)<USER_QUERY>\\s*(.*?)\\s*</USER_QUERY>"));
  });

  it("rejects patterns missing the (?s) prefix", () => {
    assert.ok(!isStaticallyValid(".*</tag>\\s*(.*)"));
  });

  it("rejects patterns that anchor on HTML comments", () => {
    assert.ok(!isStaticallyValid("(?s).*<!-- DESCRIPTION END -->\\s*(.*)"));
    assert.ok(!isStaticallyValid("(?s)^(.*?)-->"));
  });

  it("rejects two-anchor patterns with different tag names", () => {
    assert.ok(!isStaticallyValid("(?s).*</context>\\s*(.*)\\s*<final_instruction>"));
  });

  it("rejects multi-group patterns", () => {
    assert.ok(!isStaticallyValid("(?s)(.*)(.*)"));
  });

  it("rejects zero-group patterns", () => {
    assert.ok(!isStaticallyValid("(?s).*</tag>\\s*"));
  });
});

describe("patternBOnTrailingTag", () => {
  it("vetoes Pattern B when input ends with the same closing tag", () => {
    const text = "<system-reminder>everything is scaffolding</system-reminder>";
    const hints = computeLayoutHints(text);
    assert.ok(patternBOnTrailingTag("(?s).*</system-reminder>\\s*(.*)", hints));
  });

  it("does not veto Pattern B when input has prose after the last close", () => {
    const hints = computeLayoutHints(STACKED_REMINDERS_INPUT);
    assert.ok(!patternBOnTrailingTag("(?s).*</system-reminder>\\s*(.*)", hints));
  });

  it("does not veto when tag names differ", () => {
    const text = "<a>x</a>";
    const hints = computeLayoutHints(text);
    assert.ok(!patternBOnTrailingTag("(?s).*</different>\\s*(.*)", hints));
  });
});

describe("captureLeaksWrapperTag", () => {
  it("flags captures that begin with a known wrapper", () => {
    assert.ok(captureLeaksWrapperTag("<system-reminder>still scaffolding</system-reminder>"));
    assert.ok(captureLeaksWrapperTag("  <context>data</context>"));
    assert.ok(captureLeaksWrapperTag("<USER_QUERY>foo</USER_QUERY>"));
  });

  it("does not flag plain prose", () => {
    assert.ok(!captureLeaksWrapperTag("Lead intake from the enrichment pipeline."));
    assert.ok(!captureLeaksWrapperTag("<p>HTML content tag, not a wrapper</p>"));
  });
});

describe("applyRegex with the verification example", () => {
  it("strips all three reminder blocks via Pattern B", () => {
    const pattern = "(?s).*</system-reminder>\\s*(.*)";
    const result = applyRegex(pattern, STACKED_REMINDERS_INPUT);
    assert.strictEqual(result.kind, "extracted");
    if (result.kind !== "extracted") return;
    assert.ok(!result.text.includes("<system-reminder>"));
    assert.ok(!result.text.includes("</system-reminder>"));
    assert.ok(result.text.startsWith("Lead intake"));
    assert.ok(result.text.includes("Lead id: lead:abc123"));
  });

  it("falls back to trimmed input when capture leaks a wrapper tag", () => {
    // A regex that does NOT have the leading greedy ".*" anchors on the FIRST
    // </system-reminder>, leaking the rest of the scaffolding into the capture.
    const leakyPattern = "(?s)</system-reminder>\\s*(.*)";
    const result = applyRegex(leakyPattern, STACKED_REMINDERS_INPUT);
    assert.strictEqual(result.kind, "extracted");
    if (result.kind !== "extracted") return;
    assert.strictEqual(result.text, STACKED_REMINDERS_INPUT.trim());
  });

  it("returns no-user-request on empty capture (Pattern C)", () => {
    const text = "<system-reminder>nothing else</system-reminder>";
    const result = applyRegex("(?s)()", text);
    assert.strictEqual(result.kind, "no-user-request");
  });

  it("returns no-match for a malformed regex", () => {
    const result = applyRegex("(?s)[unclosed", "anything");
    assert.strictEqual(result.kind, "no-match");
  });
});
