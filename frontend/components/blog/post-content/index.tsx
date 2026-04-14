import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { MDXRemote } from "next-mdx-remote/rsc";
import React from "react";
import remarkGfm from "remark-gfm";

import LightboxImage from "@/components/blog/lightbox-image";
import MDHeading from "@/components/blog/md-heading";
import PreHighlighter from "@/components/blog/pre-highlighter";
import YouTubeEmbed, { extractYouTubeId } from "@/components/blog/youtube-embed";
import { type BlogMetadata } from "@/lib/blog/types";

import BlogMeta from "../blog-meta";

interface PostContentProps {
  data: BlogMetadata;
  content: string;
  backHref: string;
  backLabel: string;
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

export default function PostContent({ data, content, backHref, backLabel, slug, routePrefix }: PostContentProps) {
  return (
    <div className="mt-8 md:mt-14 lg:mt-20 flex justify-center flex-col items-center pb-16 px-4">
      <ArticleJsonLd data={data} slug={slug} routePrefix={routePrefix} />
      <div className="w-full md:w-[700px] lg:max-w-3xl">
        <Link
          href={backHref}
          className="text-sm text-secondary-foreground hover:text-primary flex items-center gap-0.5 w-fit"
        >
          <ChevronLeft size={16} />
          {backLabel}
        </Link>
      </div>
      <BlogMeta data={data} className="mt-4" />
      <article className="flex flex-col z-30 md:w-[700px] lg:max-w-3xl w-full md:px-0 sm:mt-8">
        <div className="pt-4 text-base">
          <MDXRemote
            source={content}
            options={{ mdxOptions: { remarkPlugins: [remarkGfm] } }}
            components={{
              h1: (props) => <MDHeading props={props} level={0} />,
              h2: (props) => <MDHeading props={props} level={1} />,
              h3: (props) => <MDHeading props={props} level={2} />,
              h4: (props) => <MDHeading props={props} level={3} />,
              p: (props) => {
                const children = React.Children.toArray(props.children);
                if (children.length === 1) {
                  const child = children[0];
                  if (
                    React.isValidElement<{
                      href?: string;
                      children?: React.ReactNode;
                    }>(child) &&
                    typeof child.props.href === "string" &&
                    extractYouTubeId(child.props.href)
                  ) {
                    const linkChildren = React.Children.toArray(child.props.children);
                    const isBareUrl =
                      linkChildren.length === 1 &&
                      typeof linkChildren[0] === "string" &&
                      linkChildren[0] === child.props.href;
                    if (isBareUrl) {
                      return <YouTubeEmbed url={child.props.href} />;
                    }
                  }
                }
                return <p className="pt-4 text-white/85 font-light" {...props} />;
              },
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
              strong: (props) => <strong className="text-white/90 font-semibold" {...props} />,
              img: (props) => (
                <LightboxImage className="md:w-[1000px] relative w-full border rounded-lg mb-8" {...props} />
              ),
              YouTubeEmbed,
            }}
          />
        </div>
      </article>
    </div>
  );
}
