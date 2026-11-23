"use client";

import { AnimatePresence, motion, type Variants } from "framer-motion";
import { useCallback, useMemo } from "react";

import AnnouncementAction from "@/components/announcements/announcement-action";
import { type CarouselSlide } from "@/components/announcements/slide-card";
import { useOpenSourceSlide } from "@/components/announcements/use-open-source-slide";
import { useAnimationSlowdown } from "@/components/dev/use-animation-slowdown";
import { useSidebar } from "@/components/ui/sidebar";
import { type Announcement, getVisibleAnnouncements, isMockAnnouncement } from "@/lib/announcements/types";
import { useToast } from "@/lib/hooks/use-toast";
import { withBasePath } from "@/lib/utils";

import { useAnnouncementsStore } from "./store";
import FigmaCarousel from "./variants/figma-carousel";

interface AnnouncementsProps {
  announcements: Announcement[];
  initialDismissedIds: string[];
  /** Prepends the "Laminar is open-source" slide (cloud only). */
  showOpenSource: boolean;
}

const buildWrapperVariants = (slowdown: number): Variants => ({
  exit: (reason: "dismissed" | "hidden") =>
    reason === "dismissed"
      ? {
          height: 0,
          opacity: 0,
          y: 120,
          // Clip only while collapsing; at rest the carousel dots hang below the li.
          overflow: "hidden",
          transition: {
            height: { duration: 0.35 * slowdown, ease: "easeInOut" },
            opacity: { duration: 0.2 * slowdown },
            y: { type: "spring", visualDuration: 0.35 * slowdown, bounce: 0.15 },
          },
        }
      : { height: 0, opacity: 0, overflow: "hidden", transition: { duration: 0 } },
});

const Announcements = ({ announcements, initialDismissedIds, showOpenSource }: AnnouncementsProps) => {
  const { open, openMobile } = useSidebar();
  const { toast } = useToast();
  const sessionDismissedIds = useAnnouncementsStore((state) => state.dismissedIds);
  const markDismissed = useAnnouncementsStore((state) => state.dismiss);
  const undoDismiss = useAnnouncementsStore((state) => state.undoDismiss);
  const setDetailsAnnouncement = useAnnouncementsStore((state) => state.setDetailsAnnouncement);
  // Unioned during render rather than hydrated into the store, so a card the
  // server already knows is dismissed never flashes before being filtered out.
  const visibleAnnouncements = useMemo(
    () => getVisibleAnnouncements(announcements, new Set([...initialDismissedIds, ...sessionDismissedIds])),
    [announcements, initialDismissedIds, sessionDismissedIds]
  );
  const sidebarOpen = open || openMobile;
  const slowdown = useAnimationSlowdown();
  const wrapperVariants = useMemo(() => buildWrapperVariants(slowdown), [slowdown]);

  const openDetails = useCallback(
    (id: string) => setDetailsAnnouncement(announcements.find((announcement) => announcement.id === id) ?? null),
    [announcements, setDetailsAnnouncement]
  );

  const dismiss = useCallback(
    async (id: string) => {
      markDismissed(id);
      if (isMockAnnouncement(id)) return;

      try {
        const response = await fetch(withBasePath(`/api/announcements/${encodeURIComponent(id)}/dismissal`), {
          method: "PUT",
        });
        if (!response.ok) {
          const message = await response
            .json()
            .then((body) => body?.error as string | undefined)
            .catch(() => undefined);
          throw new Error(message ?? "Could not dismiss announcement");
        }
      } catch (error) {
        undoDismiss(id);
        toast({
          variant: "destructive",
          title: error instanceof Error ? error.message : "Could not dismiss announcement",
        });
      }
    },
    [markDismissed, undoDismiss, toast]
  );

  const openSourceSlide = useOpenSourceSlide(showOpenSource);
  const slides = useMemo<CarouselSlide[]>(
    () => [
      ...(openSourceSlide ? [openSourceSlide] : []),
      ...visibleAnnouncements.map((announcement) => ({
        id: announcement.id,
        title: announcement.title,
        description: announcement.description,
        action: <AnnouncementAction announcement={announcement} onOpenDetails={openDetails} />,
        onDismiss: () => dismiss(announcement.id),
      })),
    ],
    [openSourceSlide, visibleAnnouncements, openDetails, dismiss]
  );

  // The details dialog is mounted by the project layout, outside this
  // collapse-gated subtree, so an open dialog survives a sidebar collapse.
  return (
    <AnimatePresence initial={false} custom={slides.length === 0 ? "dismissed" : "hidden"}>
      {sidebarOpen && slides.length > 0 && (
        <motion.li key="announcements" variants={wrapperVariants} exit="exit" className="relative">
          <FigmaCarousel slides={slides} />
        </motion.li>
      )}
    </AnimatePresence>
  );
};

export default Announcements;
