import { getBlogPost } from "@/lib/blog/utils";

import { authOptions } from "@/lib/auth";
import BlogMeta from "@/components/blog/blog-meta";
import { getServerSession } from "next-auth";
import LandingHeader from "@/components/landing/landing-header";
import MDHeading from "@/components/blog/md-heading";
import { MDXRemote } from "next-mdx-remote/rsc";
import type { Metadata } from "next";
import Footer from "@/components/landing/footer";

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
          <div className="pt-12 pb-48">
            <MDXRemote
              source={content}
              components={{
                h1: (props) => <MDHeading props={props} level={0} />,
                h2: (props) => <MDHeading props={props} level={1} />,
                h3: (props) => <MDHeading props={props} level={2} />,
                h4: (props) => <MDHeading props={props} level={3} />,
                p: (props) => <p className="text-lg py-1" {...props} />,
                a: (props) => <a className="text-primary underline" {...props} />,
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
