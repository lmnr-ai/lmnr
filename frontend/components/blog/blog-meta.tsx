import Image from "next/image";
import Link from "next/link";

import { type BlogMetadata } from "@/lib/blog/types";
import { cn, formatUTCDate } from "@/lib/utils";

interface BlogMetaProps {
  data: BlogMetadata;
  className?: string;
}

// Width-agnostic — the parent layout container decides how wide this lives.
export default function BlogMeta({ data, className }: BlogMetaProps) {
  return (
    <div className={cn("flex flex-col gap-8 w-full", className)}>
      <div className="flex flex-col space-y-4">
        <h1 className="text-3xl sm:text-5xl leading-tight tracking-tight font-medium font-manrope">{data.title}</h1>
        <div className="flex space-x-3 text-sm text-secondary-foreground">
          <p>{formatUTCDate(data.date)}</p>
          <p>·</p>
          {data.author.url ? (
            <Link href={data.author.url} className="hover:text-primary">
              {data.author.name}
            </Link>
          ) : (
            <p>{data.author.name}</p>
          )}
        </div>
      </div>
      {data.image && (
        <div className="w-full flex rounded overflow-hidden">
          <Image src={data.image} alt={data.title} width={1000} height={800} className="w-full h-auto" />
        </div>
      )}
    </div>
  );
}
