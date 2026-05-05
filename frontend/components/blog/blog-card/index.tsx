import Image from "next/image";
import Link from "next/link";

import { formatCategoryLabel } from "@/lib/blog/format";
import { type BlogListItem } from "@/lib/blog/types";
import { cn, formatUTCDate } from "@/lib/utils";

type Variant = "featured" | "default" | "compact" | "minimal";

interface BlogCardProps {
  post: BlogListItem;
  variant?: Variant;
  routePrefix?: string;
  category?: string;
  className?: string;
}

const CategoryBadge = ({ label }: { label: string }) => (
  <span className="inline-block text-xs tracking-wider font-medium uppercase text-landing-text-300">{label}</span>
);

export default function BlogCard({
  post,
  variant = "default",
  routePrefix = "blog",
  category,
  className,
}: BlogCardProps) {
  const href = `/${routePrefix}/${post.slug}`;
  const categoryLabel = formatCategoryLabel(category ?? post.tags?.[0]);
  const formattedDate = formatUTCDate(post.data.date);

  if (variant === "minimal") {
    return (
      <Link href={href} className={cn("group flex flex-col gap-4 no-underline", className)}>
        {post.data.image && (
          <div className="relative w-full aspect-[3/2] overflow-hidden rounded-lg bg-landing-surface-600">
            <Image
              src={post.data.image}
              alt={post.data.title}
              fill
              sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
              className="object-cover transition-opacity duration-200 group-hover:opacity-90"
            />
          </div>
        )}
        <div className="flex flex-col gap-2">
          <CategoryBadge label={categoryLabel} />
          <h3 className="font-space-grotesk text-lg md:text-xl tracking-tight text-landing-text-100 transition-colors group-hover:text-primary">
            {post.data.title}
          </h3>
          {post.data.description && (
            <p className="text-sm text-landing-text-300 leading-relaxed line-clamp-2">{post.data.description}</p>
          )}
          <div className="flex items-center gap-2 text-xs text-landing-text-400">
            <span className="truncate">{post.data.author.name}</span>
            <span aria-hidden>·</span>
            <time dateTime={post.data.date}>{formattedDate}</time>
          </div>
        </div>
      </Link>
    );
  }

  if (variant === "compact") {
    return (
      <Link
        href={href}
        className={cn(
          "group flex flex-col gap-1 border-b border-landing-surface-500 py-5 no-underline",
          "md:flex-row md:items-baseline md:gap-6",
          className
        )}
      >
        <div className="md:w-32 shrink-0">
          <CategoryBadge label={categoryLabel} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-space-grotesk text-lg md:text-xl tracking-tight text-landing-text-100 transition-colors group-hover:text-primary">
            {post.data.title}
          </h4>
        </div>
        <div className="flex items-center gap-2 text-xs text-landing-text-400 md:shrink-0">
          <span className="truncate">{post.data.author.name}</span>
          <span aria-hidden>·</span>
          <time dateTime={post.data.date}>{formattedDate}</time>
        </div>
      </Link>
    );
  }

  if (variant === "featured") {
    return (
      <Link href={href} className={cn("group grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-10 no-underline", className)}>
        {post.data.image && (
          <div className="relative w-full aspect-[3/2] overflow-hidden rounded-xl bg-landing-surface-600">
            <Image
              src={post.data.image}
              alt={post.data.title}
              fill
              sizes="(min-width: 768px) 50vw, 100vw"
              className="object-cover transition-opacity duration-200 group-hover:opacity-90"
              priority
            />
          </div>
        )}
        <div className="flex flex-col justify-center gap-4">
          <CategoryBadge label={categoryLabel} />
          <h2 className="font-space-grotesk text-3xl md:text-4xl leading-tight tracking-tight text-landing-text-100 transition-colors group-hover:text-primary">
            {post.data.title}
          </h2>
          {post.data.description && (
            <p className="text-base text-landing-text-300 leading-relaxed line-clamp-3">{post.data.description}</p>
          )}
          <div className="flex items-center gap-2 text-xs text-landing-text-400">
            <span>{post.data.author.name}</span>
            <span aria-hidden>·</span>
            <time dateTime={post.data.date}>{formattedDate}</time>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={cn(
        "group flex flex-col overflow-hidden rounded-xl border border-landing-surface-500 bg-landing-surface-700 no-underline",
        className
      )}
    >
      {post.data.image && (
        <div className="relative w-full aspect-[4/3] overflow-hidden bg-landing-surface-600">
          <Image
            src={post.data.image}
            alt={post.data.title}
            fill
            sizes="(min-width: 768px) 33vw, 100vw"
            className="object-cover transition-opacity duration-200 group-hover:opacity-95"
          />
        </div>
      )}
      <div className="flex flex-1 flex-col gap-3 p-5">
        <h3 className="font-space-grotesk text-lg md:text-xl tracking-tight text-landing-text-100 transition-colors group-hover:text-primary line-clamp-2">
          {post.data.title}
        </h3>
        {post.data.description && (
          <p className="text-sm text-landing-text-300 leading-relaxed line-clamp-2">{post.data.description}</p>
        )}
        <div className="mt-auto flex items-center gap-2 text-xs text-landing-text-400">
          <span className="truncate">{post.data.author.name}</span>
          <span aria-hidden>·</span>
          <time dateTime={post.data.date}>{formattedDate}</time>
        </div>
      </div>
    </Link>
  );
}
