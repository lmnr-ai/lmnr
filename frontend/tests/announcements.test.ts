import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { useAnnouncementsStore } from "@/components/announcements/store";
import { normalizeStrapiUploadUrls } from "@/lib/announcements/normalize";
import {
  type Announcement,
  getAnnouncementCtaHref,
  getVisibleAnnouncements,
  isInternalAnnouncementLink,
  isSupportedAnnouncementLink,
} from "@/lib/announcements/types";
import { parseUserPreferences } from "@/lib/user-preferences";

const announcement = (id: string, createdAt: string, expiresAt: string): Announcement => ({
  id,
  title: id,
  description: id,
  created_at: createdAt,
  expires_at: expiresAt,
});

describe("getVisibleAnnouncements", () => {
  const now = new Date("2026-04-15T12:00:00.000Z");
  const announcements = [
    announcement("older", "2026-04-01T00:00:00.000Z", "2026-05-01T00:00:00.000Z"),
    announcement("newer", "2026-04-10T00:00:00.000Z", "2026-05-01T00:00:00.000Z"),
    announcement("expired", "2026-04-12T00:00:00.000Z", "2026-04-15T11:59:59.000Z"),
  ];

  it("returns active, undismissed announcements newest first", () => {
    const result = getVisibleAnnouncements(announcements, new Set(["older"]), now);
    assert.deepStrictEqual(
      result.map(({ id }) => id),
      ["newer"]
    );
  });

  it("does not mutate Strapi's response order", () => {
    getVisibleAnnouncements(announcements, new Set(), now);
    assert.deepStrictEqual(
      announcements.map(({ id }) => id),
      ["older", "newer", "expired"]
    );
  });
});

describe("normalizeStrapiUploadUrls", () => {
  it("proxies absolute Strapi images embedded in Markdown", () => {
    const markdown = "Before\n\n![Screenshot](https://cms.example.com/uploads/screenshot.png)\n\nAfter";
    assert.equal(normalizeStrapiUploadUrls(markdown), "Before\n\n![Screenshot](/uploads/screenshot.png)\n\nAfter");
  });

  it("does not consume Markdown between unrelated links and uploads", () => {
    const markdown = "[Docs](https://example.com/docs)\n\nHeading\n\n![Image](/uploads/image.png)";
    assert.equal(normalizeStrapiUploadUrls(markdown), markdown);
  });
});

describe("session dismissals", () => {
  const now = new Date("2026-04-15T12:00:00.000Z");
  const announcements = [announcement("one", "2026-04-10T00:00:00.000Z", "2026-05-01T00:00:00.000Z")];
  // The sidebar card unmounts on collapse, so a remount re-derives visibility
  // from the store plus the server list it was rendered with — which is still
  // the pre-dismissal payload until the next full layout render.
  const visibleAfterRemount = (serverDismissedIds: string[]) =>
    getVisibleAnnouncements(
      announcements,
      new Set([...serverDismissedIds, ...useAnnouncementsStore.getState().dismissedIds]),
      now
    ).map(({ id }) => id);

  it("keeps a dismissed card hidden across a remount with a stale server list", () => {
    useAnnouncementsStore.getState().dismiss("one");
    assert.deepStrictEqual(visibleAfterRemount([]), []);
  });

  it("brings the card back when persistence fails", () => {
    useAnnouncementsStore.getState().undoDismiss("one");
    assert.deepStrictEqual(visibleAfterRemount([]), ["one"]);
  });

  it("still honours ids the server reports as dismissed", () => {
    assert.deepStrictEqual(visibleAfterRemount(["one"]), []);
  });
});

describe("announcement CTA links", () => {
  it("resolves root-relative links within the current project", () => {
    assert.equal(getAnnouncementCtaHref("/signals", "project-id"), "/project/project-id/signals");
    assert.equal(isInternalAnnouncementLink("/signals"), true);
  });

  it("leaves HTTPS links unchanged", () => {
    const link = "https://docs.laminar.sh/signals";
    assert.equal(getAnnouncementCtaHref(link, "project-id"), link);
    assert.equal(isInternalAnnouncementLink(link), false);
    assert.equal(isSupportedAnnouncementLink(link), true);
  });

  it("rejects protocol-relative and unsafe schemes", () => {
    assert.equal(isSupportedAnnouncementLink("//example.com"), false);
    assert.equal(isSupportedAnnouncementLink("javascript:alert(1)"), false);
  });
});

describe("parseUserPreferences", () => {
  it("reads dismissed announcements and preserves future preferences", () => {
    assert.deepStrictEqual(parseUserPreferences({ dismissed_announcement_ids: ["one"], future_setting: true }), {
      dismissed_announcement_ids: ["one"],
      future_setting: true,
    });
  });

  it("falls back to empty preferences for invalid values", () => {
    assert.deepStrictEqual(parseUserPreferences(null), {});
  });
});
