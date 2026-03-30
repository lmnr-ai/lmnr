import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { extractYouTubeId } from "@/components/blog/youtube-embed";

describe("extractYouTubeId", () => {
  it("extracts ID from standard watch URL", () => {
    assert.strictEqual(extractYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  });

  it("extracts ID from short youtu.be URL", () => {
    assert.strictEqual(extractYouTubeId("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  });

  it("extracts ID from embed URL", () => {
    assert.strictEqual(extractYouTubeId("https://www.youtube.com/embed/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  });

  it("extracts ID from shorts URL", () => {
    assert.strictEqual(extractYouTubeId("https://youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  });

  it("extracts ID from URL without www", () => {
    assert.strictEqual(extractYouTubeId("https://youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  });

  it("extracts ID from mobile URL", () => {
    assert.strictEqual(extractYouTubeId("https://m.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  });

  it("extracts ID from URL with extra params", () => {
    assert.strictEqual(extractYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120&list=PLxyz"), "dQw4w9WgXcQ");
  });

  it("returns null for non-YouTube URLs", () => {
    assert.strictEqual(extractYouTubeId("https://www.google.com"), null);
  });

  it("returns null for invalid URLs", () => {
    assert.strictEqual(extractYouTubeId("not a url"), null);
  });

  it("returns null for YouTube URL without video ID", () => {
    assert.strictEqual(extractYouTubeId("https://www.youtube.com/"), null);
  });

  it("rejects path-traversal characters in watch v param", () => {
    assert.strictEqual(extractYouTubeId("https://www.youtube.com/watch?v=../malicious"), null);
  });

  it("rejects special characters in youtu.be path", () => {
    assert.strictEqual(extractYouTubeId("https://youtu.be/foo%2F..%2Fbar"), null);
  });

  it("rejects empty v param", () => {
    assert.strictEqual(extractYouTubeId("https://www.youtube.com/watch?v="), null);
  });
});
