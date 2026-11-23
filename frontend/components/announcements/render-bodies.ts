import "server-only";
import { type ReactNode } from "react";

import { renderBlogMdx } from "@/components/blog/post-content/blog-mdx";
import { type Announcement } from "@/lib/announcements/types";

/**
 * Pre-renders each announcement's body with the blog MDX pipeline (server-only),
 * keyed by id for the client details dialog. Invalid MDX is dropped so one bad
 * Strapi entry can't break the project layout; the dialog then falls back to
 * plain markdown.
 */
export async function renderAnnouncementBodies(announcements: Announcement[]): Promise<Record<string, ReactNode>> {
  const entries = await Promise.all(
    announcements.map(async ({ id, long_description }) => {
      if (!long_description) return null;
      try {
        return [id, await renderBlogMdx(long_description)] as const;
      } catch (error) {
        console.error(`Failed to render announcement ${id} as MDX`, error);
        return null;
      }
    })
  );
  return Object.fromEntries(entries.filter((entry) => entry !== null));
}
