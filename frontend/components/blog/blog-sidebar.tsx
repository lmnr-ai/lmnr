import Link from "next/link";

import { type BlogMetadata } from "@/lib/blog/types";
import { cn, formatUTCDate } from "@/lib/utils";

import TableOfContents from "./table-of-contents";

interface TocItem {
  level: number;
  text: string;
  anchor: string;
}

interface Props {
  data: BlogMetadata;
  tocItems: TocItem[];
  className?: string;
}

const MetaRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex flex-col gap-1">
    <p className="text-sm text-white font-medium">{label}</p>
    <p className="text-sm text-landing-text-300">{value}</p>
  </div>
);

export default function BlogSidebar({ data, tocItems, className }: Props) {
  const category = data.tags?.[0];

  // Sticky at top-24 (96px). Cap height to `100vh - 6rem` so the TOC region
  // can scroll independently when the outline outgrows the viewport. The
  // top sections (metadata, CTA, "On this page" header) are shrink-0; the
  // <nav> inside TableOfContents is the only flex-1 + overflow child, so
  // scrollIntoView({ block: "nearest" }) finds the nav as its scrollable
  // ancestor instead of falling back to the document.
  return (
    <aside className={cn("flex flex-col gap-8 max-h-[calc(100vh-6rem)]", className)}>
      <div className="flex flex-col gap-5 shrink-0">
        <MetaRow
          label="Author"
          value={
            data.author.url ? (
              <Link href={data.author.url} target="_blank" className="hover:text-landing-text-100">
                {data.author.name}
              </Link>
            ) : (
              data.author.name
            )
          }
        />
        {category && <MetaRow label="Category" value={category} />}
        <MetaRow label="Date" value={formatUTCDate(data.date)} />
      </div>

      <Link
        href="/sign-up"
        className="flex items-center justify-center w-full h-[36px] rounded-sm bg-landing-primary-200 hover:bg-landing-primary-400 transition-colors no-underline shrink-0"
      >
        <span className="font-sans-landing font-medium text-sm text-black">Get started – free</span>
      </Link>

      {tocItems.length > 0 && (
        <div className="flex flex-col gap-3 pt-6 border-t border-landing-surface-500 flex-1 min-h-0">
          <p className="text-xs text-landing-text-300 shrink-0">On this page</p>
          <TableOfContents headings={tocItems} className="flex-1 min-h-0" />
        </div>
      )}
    </aside>
  );
}
