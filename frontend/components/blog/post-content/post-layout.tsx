import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { type ReactNode } from "react";

import { LANDING_COLUMN_MAX_W } from "@/components/landing/class-names";
import CTAButtons from "@/components/landing/cta-buttons";
import { type BlogMetadata } from "@/lib/blog/types";
import { cn, formatUTCDate } from "@/lib/utils";

import BlogMeta from "../blog-meta";
import BlogSidebar from "../blog-sidebar";

interface TocItem {
  level: number;
  text: string;
  anchor: string;
}

interface Props {
  data: BlogMetadata;
  backHref: string;
  tocItems: TocItem[];
  children: ReactNode;
}

// Two-column post layout: title spans the full container width on top; below,
// the article fills a 1fr left column (with metadata inline above the hero)
// and the 220px sticky sidebar (CTA + TOC only) sits on the right. Below `lg`
// the sidebar drops; the inline metadata stays since it lives in the article
// column, not in the sidebar.
export default function PostLayout({ data, backHref, tocItems, children }: Props) {
  return (
    <div className="mt-8 md:mt-14 lg:mt-20 flex justify-center w-full px-4 pb-16">
      <div className={cn("flex flex-col gap-6 w-full", LANDING_COLUMN_MAX_W)}>
        <Link
          href={backHref}
          className="text-sm text-landing-text-300 hover:text-landing-text-100 flex items-center gap-1.5 w-fit no-underline"
        >
          <ArrowLeft size={16} />
          All blog posts
        </Link>

        <h1 className="text-3xl sm:text-4xl lg:text-5xl leading-tight tracking-tight font-medium font-sans-landing">
          {data.title}
        </h1>

        <p className="text-sm text-landing-text-300">
          {formatUTCDate(data.date)} · {data.author.name}
          {data.tags?.[0] ? ` · ${data.tags[0]}` : ""}
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_220px] gap-8 lg:gap-12 mt-6">
          <div className="flex flex-col gap-8 min-w-0">
            <BlogMeta data={data} />
            <article className="blog-article flex flex-col z-30 w-full font-sans-landing font-[460] text-[17px] [&>*:first-child]:pt-0 [&>*:first-child]:mt-0 [&>*:first-child>*]:mt-0">
              {children}
            </article>
          </div>

          <div className="hidden lg:block">
            <BlogSidebar tocItems={tocItems} className="sticky top-24" />
          </div>
        </div>

        {/* Post-grid footer — lives outside the two-column grid so the sticky
            sidebar unsticks above it. Generous mt to put real breathing room
            between the article and the marketing close-out. */}
        <div className="mt-32 flex flex-col gap-8">
          <div className="flex flex-col gap-4">
            <Link
              href={backHref}
              className="inline-flex items-center gap-1.5 text-sm text-landing-text-300 hover:text-white no-underline w-fit transition-colors"
            >
              <ArrowLeft size={16} />
              All blog posts
            </Link>

            <h2 className="font-sans-landing text-[32px] font-[480] text-white whitespace-pre-line leading-tight">
              {"Ship reliable agents"}
            </h2>
          </div>

          <CTAButtons />
        </div>
      </div>
    </div>
  );
}
