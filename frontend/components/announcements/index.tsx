"use client";

import { AnimatePresence, motion, type Variants } from "framer-motion";
import { useCallback, useMemo } from "react";

import { useSidebar } from "@/components/ui/sidebar";
import { type Announcement, getVisibleAnnouncements } from "@/lib/announcements/types";
import { useToast } from "@/lib/hooks/use-toast";
import { withBasePath } from "@/lib/utils";

import { useAnnouncementsStore } from "./store";
import FigmaCarousel from "./variants/figma-carousel";

interface AnnouncementsProps {
  announcements: Announcement[];
  initialDismissedIds: string[];
}

const wrapperVariants: Variants = {
  exit: (reason: "dismissed" | "hidden") =>
    reason === "dismissed"
      ? {
          height: 0,
          opacity: 0,
          y: 120,
          transition: {
            height: { duration: 0.35, ease: "easeInOut" },
            opacity: { duration: 0.2 },
            y: { type: "spring", visualDuration: 0.35, bounce: 0.15 },
          },
        }
      : { height: 0, opacity: 0, transition: { duration: 0 } },
};

const Announcements = ({ announcements, initialDismissedIds }: AnnouncementsProps) => {
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

  const openDetails = useCallback(
    (id: string) => setDetailsAnnouncement(announcements.find((announcement) => announcement.id === id) ?? null),
    [announcements, setDetailsAnnouncement]
  );

  const dismiss = useCallback(
    async (id: string) => {
      markDismissed(id);

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

  // The details dialog is mounted by the project layout, outside this
  // collapse-gated subtree, so an open dialog survives a sidebar collapse.
  return (
    <AnimatePresence initial={false} custom={visibleAnnouncements.length === 0 ? "dismissed" : "hidden"}>
      {sidebarOpen && visibleAnnouncements.length > 0 && (
        <motion.li key="announcements" variants={wrapperVariants} exit="exit" className="relative overflow-hidden">
          <FigmaCarousel announcements={visibleAnnouncements} onDismiss={dismiss} onOpenDetails={openDetails} />
        </motion.li>
      )}
    </AnimatePresence>
  );
};

export default Announcements;
