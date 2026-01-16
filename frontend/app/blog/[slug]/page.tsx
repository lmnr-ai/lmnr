import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";

import BlogMeta from "@/components/blog/blog-meta";
import LightboxImage from "@/components/blog/lightbox-image";
import MDHeading from "@/components/blog/md-heading";
import PreHighlighter from "@/components/blog/pre-highlighter";
import { getBlogPost } from "@/lib/blog/utils";

export const generateMetadata = async (props: { params: Promise<{ slug: string }> }): Promise<Metadata> => {
  const params = await props.params;
  const { data } = getBlogPost(params.slug);
  return {
    title: data.title,
    description: data.description,
    authors: data.coAuthors ? [data.author, ...data.coAuthors] : [data.author],
    icons: ["https://www.lmnr.ai/favicon.ico"],
    openGraph: {
      images: data.image ? ["https://www.lmnr.ai" + data.image] : ["https://www.lmnr.ai/favicon.ico"],
      type: "article",
      publishedTime: data.date,
    },
    twitter: {
      title: data.title,
      description: data.description,
      images: data.image ? ["https://www.lmnr.ai" + data.image] : ["https://www.lmnr.ai/favicon.ico"],
    },
  };
};

export default async function BlogPostPage(props0: { params: Promise<{ slug: string }> }) {
  const params = await props0.params;

  try {
    const { data, content } = getBlogPost(params.slug);

    return (
      <div className="mt-8 md:mt-16 lg:mt-32 flex justify-center flex-col items-center pb-16 px-4">
        <BlogMeta data={data} />
        <article className="flex flex-col z-30 md:w-[700px] lg:max-w-3xl w-full px-8 md:px-0">
          <div className="pt-4 text-lg">
            <MDXRemote
              source={content}
              components={{
                h1: (props) => <MDHeading props={props} level={0} />,
                h2: (props) => <MDHeading props={props} level={1} />,
                h3: (props) => <MDHeading props={props} level={2} />,
                h4: (props) => <MDHeading props={props} level={3} />,
                p: (props) => <p className="pt-4 text-white/85 font-light leading-relaxed" {...props} />,
                a: (props) => (
                  <a
                    className="text-white underline hover:text-primary"
                    target="_blank"
                    rel="noopener noreferrer"
                    {...props}
                  />
                ),
                blockquote: (props) => <blockquote className="border-l-2 border-primary pl-4" {...props} />,
                pre: (props) => <PreHighlighter className="pl-4 py-4" {...props} />,
                code: (props) => (
                  <span
                    className="text-sm bg-secondary-foreground/20 rounded text-white font-mono px-1.5 py-0.5"
                    {...props}
                  />
                ),
                ul: (props) => <ul className="list-disc pl-4 pt-4 text-white/85 font-light" {...props} />,
                ol: (props) => <ol className="list-decimal pl-4 pt-4 text-white/85 font-light" {...props} />,
                li: (props) => (
                  <li className="pt-1.5 text-white/85 leading-relaxed" {...props}>
                    {props.children}
                  </li>
                ),
                img: (props) => (
                  <LightboxImage className="md:w-[1000px] relative w-full border rounded-lg mb-8" {...props} />
                ),
              }}
            />
          </div>
        </article>
      </div>
    );
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    notFound();
  }
}
