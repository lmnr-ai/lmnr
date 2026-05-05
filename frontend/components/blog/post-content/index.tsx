import Image from "next/image";
import Link from "next/link";
import { MDXRemote } from "next-mdx-remote/rsc";
import React from "react";
import remarkGfm from "remark-gfm";

import BlogCard from "@/components/blog/blog-card";
import BottomCTA from "@/components/blog/bottom-cta";
import LightboxImage from "@/components/blog/lightbox-image";
import MDHeading from "@/components/blog/md-heading";
import OnThisPage from "@/components/blog/on-this-page";
import PostMetadataRail from "@/components/blog/post-metadata-rail";
import PreHighlighter from "@/components/blog/pre-highlighter";
import ReadingProgressBar from "@/components/blog/reading-progress-bar";
import YouTubeEmbed, { extractYouTubeId } from "@/components/blog/youtube-embed";
import { formatCategoryLabel } from "@/lib/blog/format";
import { estimateReadingTime } from "@/lib/blog/reading-time";
import { type BlogListItem, type BlogMetadata } from "@/lib/blog/types";
import { parseHeadings } from "@/lib/blog/utils";
import { cn, formatUTCDate } from "@/lib/utils";

interface PostContentProps {
  data: BlogMetadata;
  content: string;
  backHref: string;
  backLabel: string;
  slug: string;
  routePrefix: string;
  relatedPosts?: BlogListItem[];
}

function ArticleJsonLd({ data, slug, routePrefix }: { data: BlogMetadata; slug: string; routePrefix: string }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: data.title,
    description: data.description || undefined,
    datePublished: data.date,
    dateModified: data.date,
    url: `https://laminar.sh/${routePrefix}/${slug}`,
    image: data.image || undefined,
    mainEntityOfPage: `https://laminar.sh/${routePrefix}/${slug}`,
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

export default function PostContent({
  data,
  content,
  backHref,
  backLabel,
  slug,
  routePrefix,
  relatedPosts = [],
}: PostContentProps) {
  const readingTime = estimateReadingTime(content);
  const headings = parseHeadings(content)
    .filter((h) => h.level === 1 || h.level === 2)
    .map((h) => ({ id: h.anchor, text: h.text, depth: h.level + 1 }));

  const category = data.tags?.[0];

  return (
    <>
      <ReadingProgressBar />
      <ArticleJsonLd data={data} slug={slug} routePrefix={routePrefix} />

      <div className="max-w-7xl mx-auto px-4 pt-8 md:pt-12">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-landing-text-400 hover:text-landing-text-100"
        >
          ← {backLabel}
        </Link>
      </div>

      {data.image && (
        <div className="max-w-7xl mx-auto px-4 pt-6">
          <div className="relative w-full aspect-[21/9] overflow-hidden rounded-xl bg-landing-surface-600">
            <Image
              src={data.image}
              alt={data.title}
              fill
              sizes="(min-width: 1280px) 1280px, 100vw"
              className="object-cover"
              priority
            />
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 pt-8 md:pt-12">
        <div className="max-w-3xl flex flex-col gap-4">
          {category && (
            <span className="text-xs tracking-wider font-medium uppercase text-landing-text-300">
              {formatCategoryLabel(category)}
            </span>
          )}
          <h1 className="font-space-grotesk text-4xl md:text-5xl tracking-tight text-landing-text-100 leading-tight">
            {data.title}
          </h1>
          {data.description && <p className="text-lg text-landing-text-300 leading-relaxed">{data.description}</p>}
        </div>
      </div>

      <div className="lg:hidden max-w-7xl mx-auto px-4 pt-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-landing-text-400 border-y border-landing-surface-500 py-4">
          <span className="text-landing-text-200">{data.author.name}</span>
          <span aria-hidden>·</span>
          <time dateTime={data.date}>{formatUTCDate(data.date)}</time>
          <span aria-hidden>·</span>
          <span>{readingTime} min read</span>
        </div>
        {headings.length > 0 && (
          <details className="mt-4 border-b border-landing-surface-500 pb-4 group">
            <summary className="text-xs uppercase tracking-wider text-landing-text-400 cursor-pointer list-none flex items-center justify-between">
              <span>On this page</span>
              <span className="transition-transform group-open:rotate-90">›</span>
            </summary>
            <div className="mt-3">
              <OnThisPage headings={headings} showHeader={false} />
            </div>
          </details>
        )}
      </div>

      <div className="max-w-7xl mx-auto px-4 pt-8 md:pt-12 pb-16 md:pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <article className={cn("lg:col-span-8", "prose-blog")}>
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
                  return <p className="text-[17px] leading-[1.75] text-landing-text-200 mt-6" {...props} />;
                },
                a: (props) => {
                  const isExternal = typeof props.href === "string" && /^https?:\/\//.test(props.href);
                  return (
                    <a
                      className="text-landing-text-100 underline underline-offset-4 decoration-landing-surface-400 hover:decoration-landing-text-200"
                      {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                      {...props}
                    />
                  );
                },
                blockquote: (props) => (
                  <blockquote
                    className="border-l-2 border-landing-surface-400 pl-4 italic text-landing-text-300 my-6"
                    {...props}
                  />
                ),
                pre: (props) => <PreHighlighter className="my-6" {...props} />,
                code: (props) => (
                  <span
                    className="bg-landing-surface-600 text-landing-text-100 rounded font-mono px-1.5 py-0.5 text-[0.9em]"
                    {...props}
                  />
                ),
                ul: (props) => (
                  <ul
                    className="list-disc pl-5 mt-6 space-y-2 text-[17px] text-landing-text-200 leading-[1.75] marker:text-landing-text-500"
                    {...props}
                  />
                ),
                ol: (props) => (
                  <ol
                    className="list-decimal pl-5 mt-6 space-y-2 text-[17px] text-landing-text-200 leading-[1.75] marker:text-landing-text-500"
                    {...props}
                  />
                ),
                li: (props) => <li className="leading-[1.75]" {...props} />,
                strong: (props) => <strong className="text-landing-text-100 font-semibold" {...props} />,
                hr: () => <hr className="my-12 border-t border-landing-surface-500" />,
                table: (props) => (
                  <div className="my-8 overflow-x-auto">
                    <table className="w-full border-collapse text-sm" {...props} />
                  </div>
                ),
                thead: (props) => <thead className="bg-landing-surface-700" {...props} />,
                th: (props) => (
                  <th
                    className="text-left px-4 py-2 font-semibold text-landing-text-200 border-b border-landing-surface-500"
                    {...props}
                  />
                ),
                td: (props) => (
                  <td className="px-4 py-2 text-landing-text-300 border-b border-landing-surface-500" {...props} />
                ),
                img: (props) => (
                  <LightboxImage className="w-full rounded-lg border border-landing-surface-500 my-8" {...props} />
                ),
                YouTubeEmbed,
              }}
            />
          </article>

          <div className="hidden lg:block lg:col-span-4">
            <div className="sticky top-24 self-start">
              <PostMetadataRail
                data={data}
                category={category}
                readingTime={readingTime}
                headings={headings}
                routePrefix={routePrefix}
              />
            </div>
          </div>
        </div>
      </div>

      {relatedPosts.length > 0 && (
        <section className="max-w-6xl mx-auto px-4 pb-16 md:pb-24">
          <div className="flex items-end justify-between mb-8">
            <h2 className="font-space-grotesk text-2xl md:text-3xl tracking-tight text-landing-text-100">
              You might also like
            </h2>
            <Link href={`/${routePrefix}`} className="text-sm text-landing-text-300 hover:text-landing-text-100">
              Browse all posts →
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {relatedPosts.map((post) => (
              <BlogCard
                key={post.slug}
                post={post}
                variant="default"
                routePrefix={routePrefix}
                category={(post.tags?.[0] ?? "").toLowerCase()}
              />
            ))}
          </div>
        </section>
      )}

      <BottomCTA
        title="Understand why your agent failed."
        description="Get OpenTelemetry-native tracing, alerts on described failures, and readable transcripts."
        primaryCta={{ label: "Start free", href: "/sign-up" }}
        secondaryCta={{ label: "Read the docs", href: "https://laminar.sh/docs" }}
      />
    </>
  );
}
