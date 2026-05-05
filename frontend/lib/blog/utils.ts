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

  try {
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
  } catch (err) {
    console.error("Failed to fetch blog posts from Strapi:", err);
    return [];
  }
};

export const getBlogPost = async (slug: string): Promise<MatterAndContent | null> => {
  const params = new URLSearchParams({ "filters[slug][$eq]": slug });

  try {
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
  } catch (err) {
    console.error("Failed to fetch blog post from Strapi:", err);
    return null;
  }
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

export const parseHeadings = (content: string) => {
  const tagHeadings = content.match(/(<h\d>)(.*)<\/h\d>/gm);
  const mdHeadings = content.match(/^ *(#{1,4}) (.*)$/gm);
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
      return { level: level - 1, text, anchor: headingToUrl(text) };
    })
    .filter((heading) => heading.text !== "" && heading.level >= 0);
};
