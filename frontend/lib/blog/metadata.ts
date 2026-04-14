import type { Metadata } from "next";

import { type MatterAndContent } from "./types";
import { getBlogPost } from "./utils";

export async function generatePostMetadata(
  slug: string,
  routePrefix: string,
  notFoundTitle: string
): Promise<Metadata> {
  const post = await getBlogPost(slug);
  if (!post) {
    return { title: notFoundTitle };
  }

  const { data } = post;
  const description = data.description || `${data.title} - from the Laminar team`;
  const ogImageUrl = `/${routePrefix}/${slug}/opengraph-image`;

  return {
    title: data.title,
    description,
    authors: data.coAuthors ? [data.author, ...data.coAuthors] : [data.author],
    openGraph: {
      title: data.title,
      description,
      type: "article",
      publishedTime: data.date,
      url: `https://laminar.sh/${routePrefix}/${slug}`,
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: data.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: data.title,
      description,
      images: [ogImageUrl],
    },
  };
}

export async function getPostOrNull(slug: string): Promise<MatterAndContent | null> {
  return getBlogPost(slug);
}
