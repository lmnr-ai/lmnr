import { MDXRemote } from "next-mdx-remote/rsc";
import React from "react";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";

import BlogImage from "@/components/blog/blog-image";
import MDHeading from "@/components/blog/md-heading";
import PreHighlighter from "@/components/blog/pre-highlighter";
import SharedTraceChip from "@/components/blog/shared-trace-chip";
import YouTubeEmbed, { extractYouTubeId } from "@/components/blog/youtube-embed";
import { getPublicTraceIds } from "@/lib/actions/shared/trace";
import { collectSharedTraceIds, parseSharedTraceHref } from "@/lib/blog/trace-links";
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

/**
 * Flatten link children to plain text. Labels often wrap the text in inline
 * code (`[`task-name`](url)`), and nesting the code component's own badge
 * styling inside a chip renders a badge within a badge.
 */
/** An MDX `img` node — the only child the `p` override has to hoist out. */
function isMdxImage(child: React.ReactNode): child is React.ReactElement<{ src?: string }> {
  return React.isValidElement<{ src?: string }>(child) && typeof child.props.src === "string";
}

function childrenToText(children: React.ReactNode): string {
  return React.Children.toArray(children)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") return String(child);
      if (React.isValidElement<{ children?: React.ReactNode }>(child)) return childrenToText(child.props.children);
      return "";
    })
    .join("");
}

export default async function PostContent({ data, content, backHref, slug, routePrefix }: PostContentProps) {
  // The MDX `a` override can't await, so visibility is resolved up front for
  // every trace the post mentions. Unshared traces fall back to a plain anchor
  // rather than rendering a chip that leads to a 404.
  const publicTraceIds = await getPublicTraceIds(collectSharedTraceIds(content)).catch(() => new Set<string>());

  const article = (
    <MDXRemote
      source={content}
      options={{ mdxOptions: { remarkPlugins: [remarkGfm], rehypePlugins: [rehypeSlug] } }}
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
          // BlogImage renders a <figure>, which is block content and illegal
          // inside <p>. Remark puts a standalone image in its own paragraph,
          // but an image on the line directly below text joins *that* text's
          // paragraph — so hoist every image out and keep the prose around it
          // in paragraphs of its own.
          if (children.some(isMdxImage)) {
            const out: React.ReactNode[] = [];
            let run: React.ReactNode[] = [];
            const flushRun = () => {
              // Drop whitespace-only runs (the newline between text and image).
              if (run.some((c) => typeof c !== "string" || c.trim() !== "")) {
                out.push(<p key={`p-${out.length}`}>{run}</p>);
              }
              run = [];
            };
            for (const child of children) {
              if (isMdxImage(child)) {
                flushRun();
                out.push(child);
              } else {
                run.push(child);
              }
            }
            flushRun();
            return <>{out}</>;
          }
          return <p {...props} />;
        },
        a: (props) => {
          const link = typeof props.href === "string" ? parseSharedTraceHref(props.href) : null;
          if (link && publicTraceIds.has(link.traceId)) {
            const label = childrenToText(props.children).trim();
            // A bare autolink has no label worth chipping; leave it a plain link.
            if (label && label !== props.href) {
              return <SharedTraceChip href={props.href as string} label={label} />;
            }
          }
          return (
            <a
              className="text-white underline hover:text-primary"
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            />
          );
        },
        // Keeps the brand-colored rule; typeset owns the indent.
        blockquote: (props) => <blockquote className="border-primary" {...props} />,
        // `not-typeset` on the embedded components below: each already owns its
        // own look (syntax highlighting, lightbox chrome, embed frame), and
        // opting out keeps typeset from restyling their internals. The
        // trade-off is that they also lose typeset's flow margin, so each keeps
        // the spacing class it already had.
        pre: (props) => <PreHighlighter className="not-typeset pl-4 py-4" {...props} />,
        code: (props) => (
          <span className="text-sm bg-secondary-foreground/20 rounded text-white font-mono px-1.5 py-0.5" {...props} />
        ),
        strong: (props) => <strong className="text-white/90 font-semibold" {...props} />,
        img: (props) => <BlogImage {...props} />,
        // Tables: styled via CSS descendant selectors on `.blog-article` in
        // globals.css instead of MDX component overrides. Strapi emits raw
        // HTML `<table>` markup that doesn't route through the components
        // map, so we lean on the cascade — one rule catches both markdown
        // pipe-tables (from remark-gfm) and raw HTML from Strapi.
        YouTubeEmbed,
      }}
    />
  );

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
