"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getAnnouncementCtaHref,
  isInternalAnnouncementLink,
  isSupportedAnnouncementLink,
} from "@/lib/announcements/types";
import { cn } from "@/lib/utils";

import AnnouncementMarkdown from "./announcement-markdown";
import { useAnnouncementsStore } from "./store";

// Mounted by the project layout rather than by the sidebar card: the card's
// subtree unmounts when the sidebar collapses, which would tear down an open
// dialog with it.
interface AnnouncementDetailsDialogProps {
  /** Server-rendered MDX bodies (blog renderer) keyed by announcement id. */
  bodies: Record<string, ReactNode>;
}

const AnnouncementDetailsDialog = ({ bodies }: AnnouncementDetailsDialogProps) => {
  const { projectId } = useParams<{ projectId: string }>();
  const announcement = useAnnouncementsStore((state) => state.detailsAnnouncement);
  const body = announcement ? bodies[announcement.id] : undefined;
  const setDetailsAnnouncement = useAnnouncementsStore((state) => state.setDetailsAnnouncement);
  const close = () => setDetailsAnnouncement(null);
  const ctaLink = announcement?.cta_link;
  const hasCta = Boolean(announcement?.cta_text && ctaLink && isSupportedAnnouncementLink(ctaLink));
  const ctaHref = ctaLink ? getAnnouncementCtaHref(ctaLink, projectId) : undefined;

  return (
    <Dialog open={announcement !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-[640px] gap-0 overflow-hidden p-0">
        {announcement && (
          <>
            <DialogTitle className="sr-only">{announcement.title}</DialogTitle>
            <DialogDescription className="sr-only">{announcement.description}</DialogDescription>
            {/* Image scrolls with the body so a short viewport never pushes the dialog off-screen. */}
            <ScrollArea
              className="max-h-[85vh]"
              viewportClassName="max-h-[85vh] scroll-fade-b scroll-fade-b-20 [&>div]:block! [&>div]:w-full!"
            >
              {announcement.details_image_src && (
                <Image
                  src={announcement.details_image_src}
                  alt=""
                  width={1200}
                  height={630}
                  className="max-h-[320px] w-full object-cover object-top"
                />
              )}
              <div className={cn("px-6 pt-6", hasCta ? "pb-[100px]" : "pb-6")}>
                {body ? (
                  // Same wrapper classes as the blog's <article>: typeset flow + `.blog-article` table rules.
                  <article className="blog-article typeset typeset-docs [&>*:first-child]:mt-0">{body}</article>
                ) : (
                  announcement.long_description && (
                    <AnnouncementMarkdown>{announcement.long_description}</AnnouncementMarkdown>
                  )
                )}
              </div>
            </ScrollArea>
            {hasCta && ctaHref && ctaLink && (
              <Button
                asChild
                size="lg"
                className="absolute bottom-7 left-1/2 z-10 h-10 -translate-x-1/2 rounded-full border-0 bg-primary-400 px-[26px] text-sm font-normal text-white hover:bg-primary-500"
              >
                {isInternalAnnouncementLink(ctaLink) ? (
                  <Link href={ctaHref} onClick={close}>
                    {announcement.cta_text}
                  </Link>
                ) : (
                  <a href={ctaHref} target="_blank" rel="noreferrer" onClick={close}>
                    {announcement.cta_text}
                  </a>
                )}
              </Button>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AnnouncementDetailsDialog;
