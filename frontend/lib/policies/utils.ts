import fs from "node:fs/promises";
import path from "node:path";

import matter from "gray-matter";

export interface PolicyDoc {
  title: string;
  description: string;
  content: string;
}

export const POLICY_SLUGS = ["privacy", "terms", "cookies", "data-use"] as const;
export type PolicySlug = (typeof POLICY_SLUGS)[number];

export const isPolicySlug = (slug: string): slug is PolicySlug => (POLICY_SLUGS as readonly string[]).includes(slug);

// Policies live in the repo (not Strapi) so legal changes go through PR review.
// `process.cwd()` is the frontend root in dev and in the standalone server.
const CONTENT_DIR = path.join(process.cwd(), "lib", "policies", "content");

export const getPolicy = async (slug: PolicySlug): Promise<PolicyDoc> => {
  const raw = await fs.readFile(path.join(CONTENT_DIR, `${slug}.md`), "utf8");
  const { data, content } = matter(raw);
  return {
    title: typeof data.title === "string" ? data.title : "Laminar",
    description: typeof data.description === "string" ? data.description : "",
    content,
  };
};
