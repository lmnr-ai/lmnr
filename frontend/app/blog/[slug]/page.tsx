import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { MDXRemote } from "next-mdx-remote/rsc";

import BlogMeta from "@/components/blog/blog-meta";
import MDHeading from "@/components/blog/md-heading";
import PreHighlighter from "@/components/blog/pre-highlighter";
import Footer from "@/components/landing/footer";
import LandingHeader from "@/components/landing/landing-header";
import { authOptions } from "@/lib/auth";
import { getBlogPost } from "@/lib/blog/utils";

export const generateMetadata = async ({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> => {
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

export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  const { data, content } = getBlogPost(params.slug);
  const session = await getServerSession(authOptions);
  return (
    <>
      <LandingHeader hasSession={session !== null && session !== undefined} />
      <div className="mt-32 h-full flex justify-center">
        {/* <div className="w-1/4 flex justify-end">
          <Link href="/blog" className="text-secondary-foreground hover:text-primary h-0">Back to all posts</Link>
        </div> */}
        <article className="flex flex-col z-30 py-16 md:w-[1000px] w-full px-8 md:px-0">
          {/* <ScrollArea className="h-full flex-grow w-full mx-auto bg-background px-16">
            <div className="h-0"> */}
          <BlogMeta data={data} />
          <div className="pt-4 pb-48">
            <MDXRemote
              source={content}
              components={{
                h1: (props) => <MDHeading props={props} level={0} />,
                h2: (props) => <MDHeading props={props} level={1} />,
                h3: (props) => <MDHeading props={props} level={2} />,
                h4: (props) => <MDHeading props={props} level={3} />,
                p: (props) => <p className="py-2 text-secondary-foreground" {...props} />,
                a: (props) => <a className="text-primary underline" target="_blank" rel="noopener noreferrer" {...props} />,
                blockquote: (props) => <blockquote className="border-l-2 border-primary pl-4 py-2" {...props} />,
                // codeblock
                pre: (props) => <PreHighlighter className="pl-4 py-4" {...props} />,
                // inline code
                code: (props) => <span className="text-sm bg-secondary text-primary font-mono px-0.5" {...props} />,
                ul: (props) => <ul className="list-disc pl-4 text-secondary-foreground" {...props} />,
                ol: (props) => <ol className="list-decimal pl-4 text-secondary-foreground" {...props} />,
                img: (props) => <img className="w-full border rounded-lg" {...props} />,
              }}
            />
          </div>
          <Footer />
          {/* </div>
          </ScrollArea> */}
        </article>
        {/* <div className="w-1/5 right-0 top-120 hidden 2xl:block fixed">
          <TableOfContents headings={parseHeadings(content)} />
        </div> */}
      </div>
    </>
  );
}
