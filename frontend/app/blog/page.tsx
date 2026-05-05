import { type Metadata } from "next";

import BlogIndex from "@/components/blog/blog-index";
import BottomCTA from "@/components/blog/bottom-cta";
import PageViewTracker from "@/components/common/page-view-tracker";
import { deriveCategoriesFromPosts, getBlogPosts } from "@/lib/blog/utils";

export const metadata: Metadata = {
  title: "Blog",
  description: "Articles on AI agent development, LLM observability, tracing, and evaluations from the Laminar team.",
  openGraph: {
    title: "Laminar Blog",
    description: "Articles on AI agent development, LLM observability, tracing, and evaluations from the Laminar team.",
    url: "https://laminar.sh/blog",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Laminar Blog",
    description: "Articles on AI agent development, LLM observability, tracing, and evaluations from the Laminar team.",
  },
};

export default async function BlogsPage() {
  const posts = await getBlogPosts({ sortByDate: true, category: "blog" });
  const categories = deriveCategoriesFromPosts(posts);

  const [featured, ...afterFeatured] = posts;
  const recent = afterFeatured.slice(0, 3);
  const rest = afterFeatured.slice(3);

  return (
    <>
      <PageViewTracker feature="blog" action="list_viewed" />

      <section className="pt-16 md:pt-24 pb-8">
        <div className="max-w-6xl mx-auto px-4">
          <h1 className="font-space-grotesk text-5xl md:text-6xl tracking-tight text-landing-text-100">Blog</h1>
        </div>
      </section>

      <BlogIndex featured={featured} recent={recent} rest={rest} categories={categories} routePrefix="blog" />

      <BottomCTA
        title="Understand why your agent failed."
        description="Get OpenTelemetry-native tracing, alerts on described failures, and readable transcripts."
        primaryCta={{ label: "Start free", href: "/sign-up" }}
        secondaryCta={{ label: "Read the docs", href: "https://laminar.sh/docs" }}
      />
    </>
  );
}
