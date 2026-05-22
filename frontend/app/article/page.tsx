import { type Metadata } from "next";

import BlogList from "@/components/blog/blog-list";
import { getBlogPosts } from "@/lib/blog/utils";

export const metadata: Metadata = {
  title: "Articles",
  description: "In-depth articles on AI observability, agent frameworks, and LLM tooling from the Laminar team.",
  openGraph: {
    title: "Laminar Articles",
    description: "In-depth articles on AI observability, agent frameworks, and LLM tooling from the Laminar team.",
    url: "https://laminar.sh/article",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Laminar Articles",
    description: "In-depth articles on AI observability, agent frameworks, and LLM tooling from the Laminar team.",
  },
};

export default async function ArticlesPage() {
  const posts = await getBlogPosts({ sortByDate: true, category: "article" });

  return <BlogList posts={posts} routePrefix="article" title="Articles" />;
}
