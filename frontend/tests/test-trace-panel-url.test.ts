import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyTracePanelAction,
  messageLinkUrl,
  tracePanelHistory,
} from "@/components/traces/trace-view/trace-panel-url";

const apply = (query: string, action: Parameters<typeof applyTracePanelAction>[1]) =>
  applyTracePanelAction(new URLSearchParams(query), action).toString();

describe("applyTracePanelAction", () => {
  it("opening a trace drops the previous span but keeps the view tabs and host params", () => {
    assert.equal(
      apply("view=sessions&traceId=a&spanId=s&traceView=tree&spanTab=attributes", { type: "open", traceId: "b" }),
      "view=sessions&traceId=b&traceView=tree&spanTab=attributes"
    );
  });

  it("opening with a span selects it", () => {
    assert.equal(apply("", { type: "open", traceId: "t", spanId: "s" }), "traceId=t&spanId=s");
  });

  it("selecting a span sets the tab only when given", () => {
    assert.equal(
      apply("traceId=t&spanTab=events", { type: "selectSpan", spanId: "s" }),
      "traceId=t&spanTab=events&spanId=s"
    );
    assert.equal(
      apply("traceId=t", { type: "selectSpan", spanId: "s", spanTab: "attributes" }),
      "traceId=t&spanId=s&spanTab=attributes"
    );
  });

  it("closing the span keeps the trace open", () => {
    assert.equal(
      apply("traceId=t&spanId=s&spanTab=events&traceView=tree", { type: "closeSpan" }),
      "traceId=t&traceView=tree"
    );
  });

  it("closing the trace drops every panel param and nothing else", () => {
    assert.equal(apply("tab=runs&traceId=t&spanId=s&traceView=tree&spanTab=events", { type: "close" }), "tab=runs");
  });

  it("does not modify its input", () => {
    const params = new URLSearchParams("traceId=t");
    applyTracePanelAction(params, { type: "close" });
    assert.equal(params.toString(), "traceId=t");
  });
});

describe("tracePanelHistory", () => {
  it("pushes open and close, replaces span moves", () => {
    assert.equal(tracePanelHistory({ type: "open", traceId: "t" }), "push");
    assert.equal(tracePanelHistory({ type: "close" }), "push");
    assert.equal(tracePanelHistory({ type: "selectSpan", spanId: "s" }), "replace");
    assert.equal(tracePanelHistory({ type: "closeSpan" }), "replace");
  });
});

describe("messageLinkUrl", () => {
  it("selects the span and replaces any old hash", () => {
    const url = messageLinkUrl("http://x/p/sessions/1?traceId=t&spanId=old#input-2", "s", "#output-0");
    assert.equal(url.toString(), "http://x/p/sessions/1?traceId=t&spanId=s#output-0");
  });
});
