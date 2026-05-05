import Link from "next/link";

import OnThisPage, { type Heading } from "@/components/blog/on-this-page";
import { formatCategoryLabel } from "@/lib/blog/format";
import { type BlogMetadata } from "@/lib/blog/types";
import { cn, formatUTCDate } from "@/lib/utils";

interface PostMetadataRailProps {
  data: BlogMetadata;
  category?: string;
  readingTime?: number;
  headings: Heading[];
  routePrefix: string;
  className?: string;
}

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="text-xs uppercase tracking-wider text-landing-text-400 mb-1.5">{children}</div>
);

export default function PostMetadataRail({
  data,
  category,
  readingTime,
  headings,
  routePrefix,
  className,
}: PostMetadataRailProps) {
  return (
    <aside className={cn("flex flex-col text-sm", className)}>
      <section className="py-5 border-b border-landing-surface-500">
        <SectionLabel>Author</SectionLabel>
        <div className="text-landing-text-100">
          {data.author.url ? (
            <Link href={data.author.url} className="hover:text-primary" target="_blank" rel="noopener noreferrer">
              {data.author.name}
            </Link>
          ) : (
            data.author.name
          )}
        </div>
      </section>

      {category && (
        <section className="py-5 border-b border-landing-surface-500">
          <SectionLabel>Category</SectionLabel>
          <div className="text-landing-text-100">{formatCategoryLabel(category)}</div>
        </section>
      )}

      <section className="py-5 border-b border-landing-surface-500">
        <SectionLabel>Published</SectionLabel>
        <div className="text-landing-text-100">{formatUTCDate(data.date)}</div>
      </section>

      {readingTime && (
        <section className="py-5 border-b border-landing-surface-500">
          <SectionLabel>Reading time</SectionLabel>
          <div className="text-landing-text-100">{readingTime} min</div>
        </section>
      )}

      <section className="py-5 border-b border-landing-surface-500 flex flex-col gap-3">
        <Link
          href="/sign-up"
          className="inline-flex items-center justify-center rounded-sm bg-landing-primary-400 px-4 py-2 text-sm font-medium text-white border border-white/40 transition-colors hover:bg-landing-primary-300"
        >
          Try Laminar for free
        </Link>
        <Link href={`/${routePrefix}`} className="text-sm text-landing-text-300 hover:text-landing-text-100">
          More articles →
        </Link>
      </section>

      {headings.length > 0 && (
        <section className="py-5">
          <OnThisPage headings={headings} />
        </section>
      )}
    </aside>
  );
}
