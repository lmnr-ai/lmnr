export interface Announcement {
  /** Stable Strapi document id persisted in the user's dismissal list. */
  id: string;
  title: string;
  description: string;
  /** Optional artwork for the compact sidebar card. */
  card_image_src?: string;
  /** Optional hero artwork for the details modal. */
  details_image_src?: string;
  /** Markdown shown in the details modal. The announcement is not clickable without it. */
  long_description?: string;
  /** Optional call to action shown when both fields are present. */
  cta_text?: string;
  cta_link?: string;
  /** ISO timestamp. */
  created_at: string;
  /** ISO timestamp after which the announcement is no longer shown. */
  expires_at: string;
}

export const isInternalAnnouncementLink = (link: string) => link.startsWith("/") && !link.startsWith("//");
export const isExternalAnnouncementLink = (link: string) => /^https:\/\//i.test(link);
export const isSupportedAnnouncementLink = (link: string) =>
  isInternalAnnouncementLink(link) || isExternalAnnouncementLink(link);

export const getAnnouncementCtaHref = (link: string, projectId: string) =>
  isInternalAnnouncementLink(link) ? `/project/${encodeURIComponent(projectId)}${link}` : link;

export const isAnnouncementActive = (announcement: Announcement, now: Date = new Date()) =>
  new Date(announcement.expires_at).getTime() > now.getTime();

export const getVisibleAnnouncements = (
  announcements: Announcement[],
  dismissedIds: ReadonlySet<string>,
  now: Date = new Date()
) =>
  announcements
    .filter((announcement) => isAnnouncementActive(announcement, now) && !dismissedIds.has(announcement.id))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
