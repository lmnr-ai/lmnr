import Image from "next/image";

import { type BlogListItem } from "@/lib/blog/types";
import { cn } from "@/lib/utils";

interface Props {
  post: BlogListItem;
  routePrefix: string;
  sizes: string;
  priority?: boolean;
  className?: string;
}

// Posts with no figure fall back to their generated OG card, so every tile in the grid has an image.
export default function PostCover({ post, routePrefix, sizes, priority, className }: Props) {
  const src = post.cover ?? `/${routePrefix}/${post.slug}/opengraph-image`;
  // A post can link a figure from any host, and `images.remotePatterns` only allowlists avatar
  // hosts: the default loader throws on unlisted hosts, so absolute URLs bypass the optimizer.
  const isRemote = !src.startsWith("/");

  return (
    <div
      className={cn("relative w-full overflow-hidden rounded-lg border border-surface-300 bg-surface-200", className)}
    >
      {/* Covers are mostly diagrams; cropping them to fill the frame cuts off axes and labels. */}
      <div className="absolute inset-4 sm:inset-6 transition-transform duration-300 group-hover:scale-[1.02]">
        <Image
          src={src}
          alt={post.data.title}
          fill
          sizes={sizes}
          priority={priority}
          unoptimized={isRemote}
          className="object-contain"
        />
      </div>
    </div>
  );
}
