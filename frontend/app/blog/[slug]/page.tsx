import type { Metadata } from "next";
import { notFound } from "next/navigation";

import PostContent from "@/components/blog/post-content";
import { generatePostMetadata } from "@/lib/blog/metadata";
import { getBlogPost } from "@/lib/blog/utils";

export const generateMetadata = async (props: { params: Promise<{ slug: string }> }): Promise<Metadata> => {
  const { slug } = await props.params;
  return generatePostMetadata(slug, "blog", "Post Not Found");
};

export default async function BlogPostPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const post = await getBlogPost(slug);
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
