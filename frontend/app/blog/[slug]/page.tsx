import type { Metadata } from "next";
import { notFound } from "next/navigation";

import PostContent from "@/components/blog/post-content";
import { generatePostMetadata, getPostOrNull } from "@/lib/blog/metadata";

export const generateMetadata = async (props: { params: Promise<{ slug: string }> }): Promise<Metadata> => {
  const { slug } = await props.params;
  return generatePostMetadata(slug, "blog", "Post Not Found");
};

export default async function BlogPostPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const post = await getPostOrNull(slug);
  if (!post) notFound();

  return (
    <PostContent
      data={post.data}
      content={post.content}
      backHref="/blog"
      backLabel="Blog"
      slug={slug}
      routePrefix="blog"
    />
  );
}
