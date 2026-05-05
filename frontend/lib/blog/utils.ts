import fs from "fs";
import matter from "gray-matter";
import path from "path";

import { type BlogListItem, type BlogMetadata, type MatterAndContent } from "./types";

const BLOG_DIR = path.join(process.cwd(), "assets/blog");

const readPostFromDisk = (file: string): MatterAndContent | null => {
  const filePath = path.join(BLOG_DIR, file);
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
  const parsed = matter(raw);
  const data = parsed.data as BlogMetadata;
  return {
    data,
    content: parsed.content,
  };
};

const toListItem = (slug: string, data: BlogMetadata): BlogListItem => ({
  ...data,
  slug,
  data,
});

export const getBlogPosts = async ({
  sortByDate = true,
  category,
}: {
  sortByDate?: boolean;
  category?: "blog" | "article";
}): Promise<BlogListItem[]> => {
  // Local mdx files only contain blog posts. Articles previously came from Strapi;
  // until we restore that, asking for "article" yields nothing.
  if (category === "article") return [];

  let files: string[];
  try {
    files = fs.readdirSync(BLOG_DIR);
  } catch {
    return [];
  }

  const posts: BlogListItem[] = [];
  for (const file of files) {
    if (!file.endsWith(".mdx")) continue;
    const slug = file.replace(/\.mdx$/, "");
    const post = readPostFromDisk(file);
    if (!post) continue;
    posts.push(toListItem(slug, post.data));
  }

  if (sortByDate) {
    posts.sort((a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime());
  }
  return posts;
};

export const getBlogPost = async (slug: string): Promise<MatterAndContent | null> => {
  const post = readPostFromDisk(`${slug}.mdx`);
  if (!post) return null;

  const { data, content } = post;
  const excerpt = data.excerpt && data.excerpt !== "" ? data.excerpt : content.slice(0, 160).replace(/\s+/g, " ");
  return { data: { ...data, excerpt }, content };
};

export const getRelatedPosts = async (
  slug: string,
  category: "blog" | "article",
  limit: number = 3
): Promise<BlogListItem[]> => {
  const all = await getBlogPosts({ sortByDate: true, category });
  const current = all.find((p) => p.slug === slug);
  const currentTags = new Set((current?.tags ?? []).map((t) => t.toLowerCase()));
  const others = all.filter((p) => p.slug !== slug);

  const withScore = others.map((p) => {
    const tags = (p.tags ?? []).map((t) => t.toLowerCase());
    const overlap = tags.filter((t) => currentTags.has(t)).length;
    return { post: p, overlap };
  });
  withScore.sort((a, b) => b.overlap - a.overlap);
  return withScore.slice(0, limit).map((r) => r.post);
};

export const deriveCategoriesFromPosts = (posts: BlogListItem[]): { value: string; label: string; count: number }[] => {
  const counts = new Map<string, number>();
  for (const post of posts) {
    const primary = (post.tags?.[0] ?? "").toLowerCase();
    if (!primary) continue;
    counts.set(primary, (counts.get(primary) ?? 0) + 1);
  }
  const sorted = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => ({
      value,
      label: value.charAt(0).toUpperCase() + value.slice(1),
      count,
    }));
  return [{ value: "all", label: "All", count: posts.length }, ...sorted];
};

export const headingToUrl = (heading: string) =>
  heading
    .replace(/[ ]/g, "-")
    .replace(/[^a-zA-Z0-9-]/g, "")
    .toLowerCase();

const stripInlineMarkdown = (text: string): string =>
  text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/(?<!\w)__(.+?)__(?!\w)/g, "$1")
    .replace(/(?<!\w)_(.+?)_(?!\w)/g, "$1")
    .replace(/<\/?[a-zA-Z][^>]*>/g, "");

export const parseHeadings = (content: string) => {
  const sansCodeBlocks = content.replace(/```[\s\S]*?```/g, "");
  const tagHeadings = sansCodeBlocks.match(/(<h\d>)(.*)<\/h\d>/gm);
  const mdHeadings = sansCodeBlocks.match(/^ *(#{1,4}) (.*)$/gm);
  const headings = [...(tagHeadings ?? []), ...(mdHeadings ?? [])];
  return headings
    .map((heading) => {
      const trimmed = heading.trim();
      const level = trimmed.match(/^ *(#{1,4}) /)?.[1].length ?? parseInt(trimmed.match(/^<h(\d)>/)?.[1] ?? "0") ?? 0;
      const rawText = trimmed
        .replace(/^ *#{1,4} /, "")
        .replace(/<h\d>/, "")
        .replace(/<\/h\d>/, "")
        .trim();
      const text = stripInlineMarkdown(rawText);
      return { level: level - 1, text, anchor: headingToUrl(text) };
    })
    .filter((heading) => heading.text !== "" && heading.level >= 0);
};
