import Link from "next/link";

import { bodyMedium, microLabel } from "@/components/landing/class-names";
import { type BlogListItem } from "@/lib/blog/types";
import { cn, formatUTCDate } from "@/lib/utils";

import PostCover from "./post-cover";

interface Props {
  post: BlogListItem;
  routePrefix: string;
}

export default function FeaturedPost({ post, routePrefix }: Props) {
  return (
    <Link href={`/${routePrefix}/${post.slug}`} className="group flex flex-col gap-6 no-underline">
      <PostCover
        post={post}
        routePrefix={routePrefix}
        sizes="(min-width: 1536px) 1000px, (min-width: 768px) 880px, 100vw"
        priority
        className="aspect-[2/1]"
      />
      <div className="flex flex-col gap-3">
        <p className={cn(microLabel, "text-sm")}>
          {formatUTCDate(post.data.date)} · {post.data.author.name}
        </p>
        <h2 className="font-sans-landing font-[500] text-white text-3xl sm:text-4xl leading-tight tracking-tight group-hover:text-foreground-50">
          {post.data.title}
        </h2>
        {post.data.description && <p className={cn(bodyMedium, "line-clamp-2")}>{post.data.description}</p>}
      </div>
    </Link>
  );
}
