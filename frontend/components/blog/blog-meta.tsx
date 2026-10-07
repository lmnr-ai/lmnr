import Image from "next/image";

import { type BlogMetadata } from "@/lib/blog/types";
import { cn } from "@/lib/utils";

interface BlogMetaProps {
  data: BlogMetadata;
  className?: string;
}

// Hero image only — title + author + date moved to BlogSidebar / PostLayout
// header. The component is retained as a focused wrapper around the lead image
// so we keep one place that controls aspect ratio + radius if we ever add a
// caption / overlay treatment.
export default function BlogMeta({ data, className }: BlogMetaProps) {
  if (!data.image) return null;
  return (
    <div className={cn("w-full flex rounded-lg overflow-hidden", className)}>
      <Image src={data.image} alt={data.title} width={1200} height={800} className="w-full h-auto" priority />
    </div>
  );
}
