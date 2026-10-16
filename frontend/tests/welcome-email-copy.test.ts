import assert from "node:assert/strict";
import { it } from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import WelcomeEmail from "@/lib/emails/welcome-email";

it("uses the new welcome introduction and tracing pitch without changing the other features", () => {
  const html = renderToStaticMarkup(createElement(WelcomeEmail));

  assert.match(html, /Hey there, it&#x27;s Robert from Laminar\. Excited for you to try it out!/);
  assert.match(html, /Laminar is an open-source observability platform purpose-built for AI agents\./);
  assert.match(html, /Here&#x27;s what you can do with Laminar:/);
  assert.match(html, /Trace your agents/);
  assert.match(html, /capture every LLM call and tool invocation\. Set up tracing for your agent with a/);
  assert.match(html, /single prompt/);
  for (const unchangedFeature of ["Signals", "CLI", "MCP", "Evals"]) {
    assert.ok(html.includes(unchangedFeature));
  }
  assert.doesNotMatch(html, /Stoked to have you join our community|Get started now with a/);
});
