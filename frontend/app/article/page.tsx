import { type Metadata } from "next";

import BlogIndex from "@/components/blog/blog-index";
import { deriveCategoriesFromPosts, getBlogPosts } from "@/lib/blog/utils";

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

  const [featured, ...afterFeatured] = posts;
  const recent = afterFeatured.slice(0, 3);
  const rest = afterFeatured.slice(3);
  const categories = deriveCategoriesFromPosts(rest);

  return (
    <>
      <section className="pt-16 md:pt-24 pb-8">
        <div className="max-w-6xl mx-auto px-4">
          <h1 className="font-space-grotesk text-5xl md:text-6xl tracking-tight text-landing-text-100">Articles</h1>
        </div>
      </section>

      <BlogIndex featured={featured} recent={recent} rest={rest} categories={categories} routePrefix="article" />
    </>
  );
}
