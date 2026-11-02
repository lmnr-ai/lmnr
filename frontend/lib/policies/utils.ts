import fs from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";

export interface PolicyDoc {
  title: string;
  description: string;
  content: string;
}

const FRONTMATTER = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

const parseFrontmatter = (raw: string): { data: Record<string, unknown>; content: string } => {
  const match = FRONTMATTER.exec(raw);
  if (!match) return { data: {}, content: raw };
  const data = parse(match[1]);
  return { data: data && typeof data === "object" ? data : {}, content: raw.slice(match[0].length) };
};

export const POLICY_SLUGS = ["privacy", "terms", "cookies", "data-use"] as const;
export type PolicySlug = (typeof POLICY_SLUGS)[number];

export const isPolicySlug = (slug: string): slug is PolicySlug => (POLICY_SLUGS as readonly string[]).includes(slug);

// Policies live in the repo (not Strapi) so legal changes go through PR review.
// `process.cwd()` is the frontend root in dev and in the standalone server.
const CONTENT_DIR = path.join(process.cwd(), "lib", "policies", "content");

export const getPolicy = async (slug: PolicySlug): Promise<PolicyDoc> => {
  const raw = await fs.readFile(path.join(CONTENT_DIR, `${slug}.md`), "utf8");
  const { data, content } = parseFrontmatter(raw);
  return {
    title: typeof data.title === "string" ? data.title : "Laminar",
    description: typeof data.description === "string" ? data.description : "",
    content,
  };
};
