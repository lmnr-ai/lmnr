import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { downloadFile, resolveDownloadFilename } from "@/components/ui/download-button";

describe("resolveDownloadFilename", () => {
  it("returns fallback when Content-Disposition is null, undefined, or empty", () => {
    assert.strictEqual(resolveDownloadFilename(null, "fallback.csv"), "fallback.csv");
    assert.strictEqual(resolveDownloadFilename(undefined, "fallback.json"), "fallback.json");
    assert.strictEqual(resolveDownloadFilename("", "fallback.csv"), "fallback.csv");
  });

  it("extracts quoted filename from Content-Disposition header", () => {
    const header = 'attachment; filename="exported-dataset-123.csv"';
    assert.strictEqual(resolveDownloadFilename(header, "fallback.csv"), "exported-dataset-123.csv");
  });

  it("extracts unquoted filename from Content-Disposition header", () => {
    const header = "attachment; filename=plain-name.json";
    assert.strictEqual(resolveDownloadFilename(header, "fallback.json"), "plain-name.json");
  });

  it("handles Content-Disposition with trailing parameters without greedy match corruption", () => {
    const header = 'attachment; filename="data.csv"; size=1048576; modification-date="2026-10-29"';
    assert.strictEqual(resolveDownloadFilename(header, "fallback.csv"), "data.csv");
  });

  it("preserves precedence: server-provided filename takes precedence over filenameFallback", () => {
    const header = 'attachment; filename="server-name.csv"';
    assert.strictEqual(resolveDownloadFilename(header, "client-fallback.csv"), "server-name.csv");
  });
});

describe("downloadFile", () => {
  let originalWindow: typeof globalThis.window;
  let originalDocument: typeof globalThis.document;
  let originalFetch: typeof globalThis.fetch;

  let clickedLink: { download: string; href: string } | null = null;
  let createdBlob: Blob | null = null;
  let revokedUrl: string | null = null;
  let appendedChild: boolean = false;
  let removedChild: boolean = false;

  beforeEach(() => {
    clickedLink = null;
    createdBlob = null;
    revokedUrl = null;
    appendedChild = false;
    removedChild = false;

    originalWindow = globalThis.window;
    originalDocument = globalThis.document;
    originalFetch = globalThis.fetch;

    const fakeWindow = {
      URL: {
        createObjectURL: (blob: Blob) => {
          createdBlob = blob;
          return "blob:http://localhost/mock-blob-url";
        },
        revokeObjectURL: (url: string) => {
          revokedUrl = url;
        },
      },
    };

    const fakeLink = {
      download: "",
      href: "",
      click: () => {
        clickedLink = { download: fakeLink.download, href: fakeLink.href };
      },
    };

    const fakeDocument = {
      createElement: (tagName: string) => {
        if (tagName === "a") {
          return fakeLink;
        }
        return {};
      },
      body: {
        appendChild: () => {
          appendedChild = true;
        },
        removeChild: () => {
          removedChild = true;
        },
      },
    };

    // @ts-expect-error test mock
    globalThis.window = fakeWindow;
    // @ts-expect-error test mock
    globalThis.document = fakeDocument;
  });

  afterEach(() => {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    globalThis.fetch = originalFetch;
  });

  it("uses filenameFallback when server returns no Content-Disposition header", async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ test: "data" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    await downloadFile("/api/test/download/json", "my-dataset-456.json", "json");

    assert.ok(clickedLink !== null, "Link should have been clicked");
    assert.ok(createdBlob !== null, "Blob should have been created");
    assert.strictEqual(clickedLink?.download, "my-dataset-456.json");
    assert.strictEqual(clickedLink?.href, "blob:http://localhost/mock-blob-url");
    assert.ok(appendedChild && removedChild, "Link should be appended and cleaned up");
    assert.strictEqual(revokedUrl, "blob:http://localhost/mock-blob-url");
  });

  it("uses server-provided filename when Content-Disposition is present", async () => {
    globalThis.fetch = async () =>
      new Response("col1,col2\n1,2", {
        status: 200,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": 'attachment; filename="server-specified-dataset.csv"',
        },
      });

    await downloadFile("/api/test/download/csv", "my-dataset-456.csv", "csv");

    assert.ok(clickedLink !== null);
    assert.strictEqual(clickedLink?.download, "server-specified-dataset.csv");
  });

  it("surfaces file format in error toast title when download fails", async () => {
    globalThis.fetch = async () =>
      new Response("Server error", {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      });

    // downloadFile catches the error and invokes toast()
    await downloadFile("/api/test/download/csv", "my-dataset-456.csv", "CSV");

    // The download link should NOT have been clicked on error
    assert.strictEqual(clickedLink, null);
  });
});
