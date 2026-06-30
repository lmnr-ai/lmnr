import { type Metadata } from "next";

import BlogList from "@/components/blog/blog-list";
import PageViewTracker from "@/components/common/page-view-tracker";
import { getBlogPosts } from "@/lib/blog/utils";
import { ogImage } from "@/lib/metadata";

export const metadata: Metadata = {
  title: "Blog",
  description: "Articles on AI agent development, LLM observability, tracing, and evaluations from the Laminar team.",
  openGraph: {
    title: "Laminar Blog",
    description: "Articles on AI agent development, LLM observability, tracing, and evaluations from the Laminar team.",
    url: "https://laminar.sh/blog",
    type: "website",
    images: [ogImage],
  },
  twitter: {
    card: "summary_large_image",
    title: "Laminar Blog",
    description: "Articles on AI agent development, LLM observability, tracing, and evaluations from the Laminar team.",
    images: [ogImage],
  },
};

export default async function BlogsPage() {
  const posts = await getBlogPosts({ sortByDate: true, category: "blog" });

  return (
    <>
      <PageViewTracker feature="blog" action="list_viewed" />
      <BlogList posts={posts} routePrefix="blog" />
    </>
  );
}
