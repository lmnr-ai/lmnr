import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { htmlAsTextRemarkRehypeOptions } from "@/components/ui/content-renderer/html-as-text";

describe("htmlAsTextRemarkRehypeOptions", () => {
  it("maps an html mdast node to a text node with the original source", () => {
    const { html } = htmlAsTextRemarkRehypeOptions.handlers;
    assert.deepEqual(html(undefined, { value: '<prompt id="sp_82e0192b" path="v4.run">' }), {
      type: "text",
      value: '<prompt id="sp_82e0192b" path="v4.run">',
    });
  });
});
