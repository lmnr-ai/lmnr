import Link from "next/link";

import { cn } from "@/lib/utils";

import TableOfContents from "./table-of-contents";

interface TocItem {
  level: number;
  text: string;
  anchor: string;
}

interface Props {
  tocItems: TocItem[];
  className?: string;
}

export default function BlogSidebar({ tocItems, className }: Props) {
  // Sticky at top-24 (96px). Cap height to `100vh - 6rem` so the TOC region
  // can scroll independently when the outline outgrows the viewport. The CTA
  // is shrink-0; the TOC nav (inside <TableOfContents>) is the flex-1 child
  // that does the scrolling.
  return (
    <aside className={cn("flex flex-col gap-8 max-h-[calc(100vh-6rem)]", className)}>
      <Link
        href="/sign-up"
        className="flex items-center justify-center w-full h-[36px] rounded-sm bg-primary-200 hover:bg-primary-400 transition-colors no-underline shrink-0"
      >
        <span className="font-sans-landing font-medium text-sm text-black">Get started with Laminar</span>
      </Link>

      {tocItems.length > 0 && (
        <div className="flex flex-col gap-3 pt-6 border-t border-surface-400 flex-1 min-h-0">
          <TableOfContents headings={tocItems} className="flex-1 min-h-0" />
        </div>
      )}
    </aside>
  );
}
