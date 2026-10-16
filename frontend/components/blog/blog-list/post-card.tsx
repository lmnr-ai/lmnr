import Link from "next/link";

import { microLabel } from "@/components/landing/class-names";
import { type BlogListItem } from "@/lib/blog/types";
import { cn, formatUTCDate } from "@/lib/utils";

import PostCover from "./post-cover";

interface Props {
  post: BlogListItem;
  routePrefix: string;
}

export default function PostCard({ post, routePrefix }: Props) {
  return (
    <Link href={`/${routePrefix}/${post.slug}`} className="group flex flex-col gap-4 no-underline">
      <PostCover
        post={post}
        routePrefix={routePrefix}
        sizes="(min-width: 768px) 500px, 100vw"
        className="aspect-[16/10]"
      />
      <div className="flex flex-col gap-2">
        <h3 className="font-sans-landing font-[500] text-white text-xl leading-7 group-hover:text-foreground-50">
          {post.data.title}
        </h3>
        {post.data.description && (
          <p className="font-sans-landing text-foreground-200 text-base line-clamp-2">{post.data.description}</p>
        )}
        <p className={cn(microLabel, "text-sm mt-1")}>
          {formatUTCDate(post.data.date)} · {post.data.author.name}
        </p>
      </div>
    </Link>
  );
}
