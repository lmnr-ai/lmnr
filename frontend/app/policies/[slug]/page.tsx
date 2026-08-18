import { type Metadata } from "next";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";

import MDHeading from "@/components/blog/md-heading";
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

  // Same markdown pipeline AND component map as blog posts (see
  // components/blog/post-content/index.tsx) minus the blog-only embeds
  // (images, YouTube, trace chips, code highlighting) that policies never
  // use. Typography comes from the `typeset typeset-docs blog-article`
  // wrapper in layout.tsx. Policy links stay same-tab (no target="_blank"):
  // unlike a blog post, readers navigate between the policies themselves.
  return (
    <MDXRemote
      source={policy.content}
      options={{ mdxOptions: { remarkPlugins: [remarkGfm], rehypePlugins: [rehypeSlug] } }}
      components={{
        h1: (props) => <MDHeading props={props} level={0} />,
        h2: (props) => <MDHeading props={props} level={1} />,
        h3: (props) => <MDHeading props={props} level={2} />,
        h4: (props) => <MDHeading props={props} level={3} />,
        a: (props) => <a className="text-white underline hover:text-primary" {...props} />,
        blockquote: (props) => <blockquote className="border-primary" {...props} />,
        code: (props) => (
          <span className="text-sm bg-secondary-foreground/20 rounded text-white font-mono px-1.5 py-0.5" {...props} />
        ),
        strong: (props) => <strong className="text-white/90 font-semibold" {...props} />,
      }}
    />
  );
}
