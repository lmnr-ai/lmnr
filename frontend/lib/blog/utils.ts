import { type BlogListItem, type MatterAndContent, type StrapiListResponse, type StrapiPost } from "./types";

const STRAPI_URL = process.env.STRAPI_URL || "http://localhost:1337";
const STRAPI_API_TOKEN = process.env.STRAPI_API_TOKEN || "";

const stripStrapiBaseUrl = (text: string): string => text.replaceAll(STRAPI_URL, "");

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
    image: post.image ? stripStrapiBaseUrl(post.image) : undefined,
    excerpt: post.description ?? undefined,
    tags: post.tags ?? undefined,
  };
  return { ...data, slug: post.slug, data };
};

export const getBlogPosts = async ({ sortByDate = true }: { sortByDate?: boolean }): Promise<BlogListItem[]> => {
  const params = new URLSearchParams({ "pagination[pageSize]": "100" });
  if (sortByDate) params.set("sort", "date:desc");

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
  return { data: mapped.data, content: stripStrapiBaseUrl(post.content) };
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
