import Link from "next/link";

import { cn } from "@/lib/utils";

interface TableOfContentsProps {
  headings: { level: number, text: string, anchor: string }[];
}

export default function TableOfContents({ headings }: TableOfContentsProps) {
  return <div>
    <div className="text-lg font-bold">In this post</div>
    <div className="flex flex-col space-y-1">
      {headings.map((heading, index) => (
        <div
          key={heading.anchor + index}
          className={cn(
            "text-secondary-foreground cursor-pointer",
            heading.level === 0 ? "font-bold" : "",
            heading.level === 1 ? "pl-2 text-sm" : "",
            heading.level === 2 ? "pl-4 text-xs" : "",
            heading.level === 3 ? "pl-6 text-xs" : "",
          )}
        >
          <Link href={`#${heading.anchor}`}>{heading.text}</Link>
        </div>
      ))}
    </div>
  </div>;
}
