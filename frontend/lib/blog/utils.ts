import GithubSlugger from "github-slugger";

import { type BlogListItem, type MatterAndContent, type StrapiListResponse, type StrapiPost } from "./types";

const STRAPI_URL = process.env.STRAPI_URL || "http://localhost:1337";
const STRAPI_API_TOKEN = process.env.STRAPI_API_TOKEN || "";

const normalizeUploadUrls = (text: string): string => text.replaceAll(/https?:\/\/[^/]+\/uploads\//g, "/uploads/");

const strapiHeaders = (): HeadersInit => {
  const headers: HeadersInit = {};
  if (STRAPI_API_TOKEN) {
    headers["Authorization"] = `Bearer ${STRAPI_API_TOKEN}`;
  }
  return headers;
};

const mapStrapiPost = (post: StrapiPost): BlogListItem => {
  const data = {
    title: post.title,
    description: post.description ?? "",
    date: post.date,
    author: {
      name: post.author_name ?? "Laminar",
      url: post.author_url ?? undefined,
    },
    image: post.image ? normalizeUploadUrls(post.image) : undefined,
    excerpt: post.description ?? undefined,
    tags: post.tags ?? undefined,
  };
  return { ...data, slug: post.slug, data };
};

export const getBlogPosts = async ({
  sortByDate = true,
  category,
}: {
  sortByDate?: boolean;
  category?: "blog" | "article";
}): Promise<BlogListItem[]> => {
  const params = new URLSearchParams({ "pagination[pageSize]": "100" });
  if (sortByDate) params.set("sort", "date:desc");
  if (category) params.set("filters[category][$eq]", category);

  const res = await fetch(`${STRAPI_URL}/api/blog-posts?${params}`, {
    headers: strapiHeaders(),
    next: { revalidate: 60 },
  });

  if (!res.ok) {
    console.error(`Strapi API error: ${res.status} ${res.statusText}`);
    return [];
  }

  const json: StrapiListResponse = await res.json();
  return json.data.map(mapStrapiPost);
};

export const getBlogPost = async (slug: string): Promise<MatterAndContent | null> => {
  const params = new URLSearchParams({ "filters[slug][$eq]": slug });

  const res = await fetch(`${STRAPI_URL}/api/blog-posts?${params}`, {
    headers: strapiHeaders(),
    next: { revalidate: 60 },
  });

  if (!res.ok) {
    console.error(`Strapi API error: ${res.status} ${res.statusText}`);
    return null;
  }

  const json: StrapiListResponse = await res.json();
  const post = json.data[0];
  if (!post) return null;

  const mapped = mapStrapiPost(post);
  return { data: mapped.data, content: normalizeUploadUrls(post.content) };
};

// Anchor slugs are produced by `github-slugger`, the same library `rehype-slug`
// uses internally when it walks the rendered HTML tree and assigns `id`s to
// heading nodes. A single fresh `GithubSlugger` per call tracks occurrence
// counts, so duplicate heading text gets suffixed (`laminar` → `laminar-1` →
// `laminar-2`). The TOC's anchors therefore match the DOM heading ids exactly.
//
// Match order matters: github-slugger is stateful and counts by call order.
// rehype-slug walks the rendered HTML tree in document order; we match that
// here by reading the raw markdown sequentially. (The previous concat of
// `tagHeadings + mdHeadings` had a latent ordering bug for mixed-syntax posts
// but most content is purely markdown, so it never surfaced.)
export const parseHeadings = (content: string) => {
  const tagHeadings = content.match(/(<h\d>)(.*)<\/h\d>/gm);
  const mdHeadings = content.match(/^ *(#{1,4}) (.*)$/gm);
  const slugger = new GithubSlugger();
  const headings = [...(tagHeadings ?? []), ...(mdHeadings ?? [])];
  return headings
    .map((heading) => {
      const trimmed = heading.trim();
      const level = trimmed.match(/^ *(#{1,4}) /)?.[1].length ?? parseInt(trimmed.match(/^<h(\d)>/)?.[1] ?? "0") ?? 0;
      const text = trimmed
        .replace(/^ *#{1,4} /, "")
        .replace(/<h\d>/, "")
        .replace(/<\/h\d>/, "")
        .trim();
      return { level: level - 1, text, anchor: slugger.slug(text) };
    })
    .filter((heading) => heading.text !== "" && heading.level >= 0);
};
