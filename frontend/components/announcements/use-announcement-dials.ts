"use client";

import { useDialKit } from "dialkit";
import { useMemo } from "react";

import { buildMockAnnouncements, MOCK_ANNOUNCEMENT_FIXTURES } from "@/lib/announcements/mocks";
import { type Announcement, isMockAnnouncement } from "@/lib/announcements/types";

import { useAnnouncementsStore } from "./store";
import { OPEN_SOURCE_STORAGE_KEY } from "./use-open-source-slide";

const IMAGE = "/opengraph-image.png";
type ImageMode = "mixed" | "all" | "none";
type Slider = [number, number, number, number];

const applyImageMode = (src: string | undefined, mode: ImageMode) =>
  mode === "mixed" ? src : mode === "all" ? IMAGE : undefined;

const restoreMockDismissals = () => {
  const { dismissedIds, undoDismiss } = useAnnouncementsStore.getState();
  dismissedIds.forEach((id) => isMockAnnouncement(id) && undoDismiss(id));
  // The open-source slide's dismissal lives in localStorage; the event re-renders useLocalStorage readers.
  localStorage.removeItem(OPEN_SOURCE_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent("laminar-local-storage-update", { detail: { key: OPEN_SOURCE_STORAGE_KEY } }));
};

// Dev-only: swaps real announcements for fixtures so every card/dialog state can be previewed.
// "mixed" keeps each fixture's own popup image; "all"/"none" force it on/off.
export function useAnnouncementDials(announcements: Announcement[]): Announcement[] {
  const total = MOCK_ANNOUNCEMENT_FIXTURES.length;
  const { mock, count, detailsImages, cta } = useDialKit(
    "Announcements",
    {
      mock: true,
      count: [total, 0, total, 1] as Slider,
      detailsImages: { type: "select", options: ["mixed", "all", "none"], default: "mixed" },
      cta: true,
      restoreDismissed: { type: "action" },
    },
    { id: "sidebar-announcements-v4", persist: true, onAction: restoreMockDismissals }
  );
  const mocks = useMemo(
    () =>
      buildMockAnnouncements()
        .slice(0, count)
        .map((a) => ({
          ...a,
          details_image_src: applyImageMode(a.details_image_src, detailsImages as ImageMode),
          cta_text: cta ? a.cta_text : undefined,
          cta_link: cta ? a.cta_link : undefined,
        })),
    [count, detailsImages, cta]
  );

  if (process.env.NODE_ENV === "production" || !mock) return announcements;
  return mocks;
}
