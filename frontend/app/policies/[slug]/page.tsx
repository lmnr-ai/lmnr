import { type Metadata } from "next";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";

import { getPolicy, isPolicySlug, POLICY_SLUGS } from "@/lib/policies/utils";

export const generateStaticParams = () => POLICY_SLUGS.map((slug) => ({ slug }));
export const dynamicParams = false;

export const generateMetadata = async (props: { params: Promise<{ slug: string }> }): Promise<Metadata> => {
  const { slug } = await props.params;
  if (!isPolicySlug(slug)) return { title: "Not Found" };
  const policy = await getPolicy(slug);
  return { title: policy.title, description: policy.description };
};

export default async function PolicyPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  if (!isPolicySlug(slug)) notFound();
  const policy = await getPolicy(slug);

  // Same markdown pipeline as the blog (next-mdx-remote + remark-gfm +
  // rehype-slug); typography comes from the `prose` wrapper in layout.tsx
  // instead of per-element component overrides.
  return (
    <MDXRemote
      source={policy.content}
      options={{ mdxOptions: { remarkPlugins: [remarkGfm], rehypePlugins: [rehypeSlug] } }}
    />
  );
}
