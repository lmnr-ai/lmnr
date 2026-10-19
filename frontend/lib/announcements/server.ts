import "server-only";
import { and, eq, not, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db/drizzle";
import { users } from "@/lib/db/migrations/schema";
import { Feature, isFeatureEnabled } from "@/lib/features/features";
import { parseUserPreferences } from "@/lib/user-preferences";

import { normalizeStrapiUploadUrls } from "./normalize";
import { type Announcement, isSupportedAnnouncementLink } from "./types";

const STRAPI_URL = process.env.STRAPI_URL ?? (process.env.NODE_ENV === "production" ? null : "http://localhost:1337");
const STRAPI_API_TOKEN = process.env.STRAPI_API_TOKEN || "";

const DateStringSchema = z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date");
const CtaLinkSchema = z
  .string()
  .refine(isSupportedAnnouncementLink, "CTA links must be project-relative paths or HTTPS URLs")
  .nullable()
  .optional()
  .catch(null);

const StrapiAnnouncementSchema = z.object({
  documentId: z.string(),
  title: z.string(),
  description: z.string(),
  card_image: z.string().nullable().optional(),
  details_image: z.string().nullable().optional(),
  content: z.string().nullable().optional(),
  cta_text: z.string().nullable().optional(),
  cta_link: CtaLinkSchema,
  expires_at: DateStringSchema,
  createdAt: DateStringSchema,
});

const StrapiAnnouncementResponseSchema = z.object({
  data: z.array(StrapiAnnouncementSchema),
});

/**
 * `null` means Strapi was unreachable or returned an unusable payload. Callers
 * must not read that as "no announcements exist".
 */
const fetchAnnouncements = async (): Promise<Announcement[] | null> => {
  if (!isFeatureEnabled(Feature.LAMINAR_CLOUD) || !STRAPI_URL) return [];

  const params = new URLSearchParams({
    "pagination[pageSize]": "100",
    sort: "createdAt:desc",
  });
  if (process.env.NODE_ENV !== "production") params.set("status", "draft");

  try {
    const response = await fetch(`${STRAPI_URL}/api/announcements?${params}`, {
      headers: STRAPI_API_TOKEN ? { Authorization: `Bearer ${STRAPI_API_TOKEN}` } : undefined,
      ...(process.env.NODE_ENV !== "production" ? { cache: "no-store" as const } : { next: { revalidate: 60 } }),
    });

    if (!response.ok) {
      console.error(`Strapi announcement API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const parsed = StrapiAnnouncementResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      console.error("Invalid Strapi announcement response", parsed.error.flatten());
      return null;
    }

    return parsed.data.data.map((announcement) => ({
      id: announcement.documentId,
      title: announcement.title,
      description: announcement.description,
      card_image_src: announcement.card_image ? normalizeStrapiUploadUrls(announcement.card_image) : undefined,
      details_image_src: announcement.details_image ? normalizeStrapiUploadUrls(announcement.details_image) : undefined,
      long_description: announcement.content ? normalizeStrapiUploadUrls(announcement.content) : undefined,
      cta_text: announcement.cta_text ?? undefined,
      cta_link: announcement.cta_link ?? undefined,
      created_at: announcement.createdAt,
      expires_at: announcement.expires_at,
    }));
  } catch (error) {
    console.error("Failed to fetch announcements from Strapi", error);
    return null;
  }
};

export const getAnnouncements = async (): Promise<Announcement[]> => (await fetchAnnouncements()) ?? [];

/**
 * Whether `announcementId` is known to be absent from the catalog. A Strapi
 * outage returns `false`, so a card the user already sees stays dismissable.
 */
export const isUnknownAnnouncement = async (announcementId: string): Promise<boolean> => {
  const announcements = await fetchAnnouncements();
  return announcements !== null && !announcements.some((announcement) => announcement.id === announcementId);
};

export const getDismissedAnnouncementIds = async (userId: string): Promise<string[]> => {
  if (!isFeatureEnabled(Feature.LAMINAR_CLOUD)) return [];

  const [user] = await db.select({ preferences: users.preferences }).from(users).where(eq(users.id, userId)).limit(1);
  return parseUserPreferences(user?.preferences).dismissed_announcement_ids ?? [];
};

export const dismissAnnouncement = async (userId: string, announcementId: string): Promise<void> => {
  if (!isFeatureEnabled(Feature.LAMINAR_CLOUD)) throw new Error("Announcements are unavailable");

  const dismissedIds = sql`CASE
    WHEN jsonb_typeof(${users.preferences}->'dismissed_announcement_ids') = 'array'
      THEN ${users.preferences}->'dismissed_announcement_ids'
    ELSE '[]'::jsonb
  END`;

  await db
    .update(users)
    .set({
      preferences: sql`jsonb_set(
        ${users.preferences},
        '{dismissed_announcement_ids}',
        CASE
          WHEN jsonb_array_length(${dismissedIds}) >= 500
            THEN (${dismissedIds} - 0) || jsonb_build_array(${announcementId}::text)
          ELSE ${dismissedIds} || jsonb_build_array(${announcementId}::text)
        END,
        true
      )`,
      updatedAt: new Date(),
    })
    .where(and(eq(users.id, userId), not(sql`${dismissedIds} @> jsonb_build_array(${announcementId}::text)`)));
};
