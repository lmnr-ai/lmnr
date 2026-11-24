"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import {
  type Announcement,
  getAnnouncementCtaHref,
  isInternalAnnouncementLink,
  isSupportedAnnouncementLink,
} from "@/lib/announcements/types";

import { CARD_BUTTON_CLASS } from "./slide-card";

interface AnnouncementActionProps {
  announcement: Announcement;
  onOpenDetails: (id: string) => void;
}

/** "Learn more" opens the details dialog; without details, the CTA links straight out. */
export default function AnnouncementAction({ announcement, onOpenDetails }: AnnouncementActionProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const { long_description, cta_text, cta_link } = announcement;
  const label = (text: string) => (
    <>
      <span>{text}</span>
      <ArrowUpRight className="size-4" />
    </>
  );

  if (long_description) {
    return (
      <button type="button" className={CARD_BUTTON_CLASS} onClick={() => onOpenDetails(announcement.id)}>
        {label("Learn more")}
      </button>
    );
  }

  if (!cta_text || !cta_link || !isSupportedAnnouncementLink(cta_link)) return null;
  const href = getAnnouncementCtaHref(cta_link, projectId);
  return isInternalAnnouncementLink(cta_link) ? (
    <Link href={href} className={CARD_BUTTON_CLASS}>
      {label(cta_text)}
    </Link>
  ) : (
    <a href={href} target="_blank" rel="noreferrer" className={CARD_BUTTON_CLASS}>
      {label(cta_text)}
    </a>
  );
}
