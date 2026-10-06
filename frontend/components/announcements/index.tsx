"use client";

import { AnimatePresence, motion, type Variants } from "framer-motion";
import { useCallback, useMemo, useState } from "react";

import { useSidebar } from "@/components/ui/sidebar";
import { type Announcement, getVisibleAnnouncements } from "@/lib/announcements/types";
import { useToast } from "@/lib/hooks/use-toast";
import { withBasePath } from "@/lib/utils";

import AnnouncementDetailsDialog from "./details-dialog";
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
  const [dismissedIds, setDismissedIds] = useState(() => new Set(initialDismissedIds));
  const [detailsAnnouncementId, setDetailsAnnouncementId] = useState<string | null>(null);
  const visibleAnnouncements = useMemo(
    () => getVisibleAnnouncements(announcements, dismissedIds),
    [dismissedIds, announcements]
  );
  const detailsAnnouncement = announcements.find((announcement) => announcement.id === detailsAnnouncementId) ?? null;
  const sidebarOpen = open || openMobile;

  const dismiss = useCallback(
    async (id: string) => {
      setDismissedIds((current) => new Set(current).add(id));

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
        setDismissedIds((current) => {
          const restored = new Set(current);
          restored.delete(id);
          return restored;
        });
        toast({
          variant: "destructive",
          title: error instanceof Error ? error.message : "Could not dismiss announcement",
        });
      }
    },
    [toast]
  );

  return (
    <>
      <AnimatePresence initial={false} custom={visibleAnnouncements.length === 0 ? "dismissed" : "hidden"}>
        {sidebarOpen && visibleAnnouncements.length > 0 && (
          <motion.div key="announcements" variants={wrapperVariants} exit="exit" className="overflow-hidden">
            <FigmaCarousel
              announcements={visibleAnnouncements}
              onDismiss={dismiss}
              onOpenDetails={setDetailsAnnouncementId}
            />
          </motion.div>
        )}
      </AnimatePresence>
      <AnnouncementDetailsDialog
        announcement={detailsAnnouncement}
        open={detailsAnnouncementId !== null}
        onOpenChange={(open) => !open && setDetailsAnnouncementId(null)}
      />
    </>
  );
};

export default Announcements;
