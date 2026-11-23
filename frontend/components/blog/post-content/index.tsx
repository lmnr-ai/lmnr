import { renderBlogMdx } from "@/components/blog/post-content/blog-mdx";
import { type BlogMetadata } from "@/lib/blog/types";
import { parseHeadings } from "@/lib/blog/utils";

import PostLayout from "./post-layout";

interface PostContentProps {
  data: BlogMetadata;
  content: string;
  backHref: string;
  slug: string;
  routePrefix: string;
}

function ArticleJsonLd({ data, slug, routePrefix }: { data: BlogMetadata; slug: string; routePrefix: string }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: data.title,
    description: data.description || undefined,
    datePublished: data.date,
    url: `https://laminar.sh/${routePrefix}/${slug}`,
    image: data.image || undefined,
    author: [
      {
        "@type": "Person",
        name: data.author.name,
        url: data.author.url || undefined,
      },
      ...(data.coAuthors ?? []).map((a) => ({
        "@type": "Person" as const,
        name: a.name,
        url: a.url || undefined,
      })),
    ],
    keywords: data.tags?.join(", ") || undefined,
    publisher: {
      "@type": "Organization",
      name: "Laminar",
      url: "https://laminar.sh",
    },
  };

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />;
}

export default async function PostContent({ data, content, backHref, slug, routePrefix }: PostContentProps) {
  const article = await renderBlogMdx(content);
  const tocItems = parseHeadings(content);

  return (
    <>
      <ArticleJsonLd data={data} slug={slug} routePrefix={routePrefix} />
      <PostLayout data={data} backHref={backHref} tocItems={tocItems}>
        {article}
      </PostLayout>
    </>
  );
}
