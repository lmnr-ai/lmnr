import Image from "next/image";
import Link from "next/link";

import { LANDING_COLUMN_MAX_W, microLabel, subSection } from "@/components/landing/class-names";
import { type BlogListItem } from "@/lib/blog/types";
import { cn, formatUTCDate } from "@/lib/utils";

interface Props {
  posts: BlogListItem[];
  routePrefix: "blog" | "article";
}

const postHref = (routePrefix: string, slug: string) => `/${routePrefix}/${slug}`;

const ThumbImage = ({
  src,
  alt,
  width,
  height,
  className,
}: {
  src: string | undefined;
  alt: string;
  width: number;
  height: number;
  className?: string;
}) => (
  <div
    className={cn("relative overflow-hidden bg-landing-surface-600 rounded shrink-0", className)}
    style={{ width, height }}
  >
    {src && (
      <Image
        src={src}
        alt={alt}
        fill
        sizes={`${width}px`}
        className="object-cover transition-transform group-hover:scale-[1.02]"
      />
    )}
  </div>
);

const ListRow = ({ post, routePrefix, isFirst }: { post: BlogListItem; routePrefix: string; isFirst: boolean }) => (
  <Link
    href={postHref(routePrefix, post.slug)}
    className={cn("flex items-start gap-10 py-5 no-underline group", !isFirst && "border-t border-landing-surface-500")}
  >
    {post.data.image && (
      <ThumbImage src={post.data.image} alt={post.data.title} width={180} height={110} className="hidden sm:block" />
    )}
    <div className="flex-1 min-w-0 flex flex-col gap-1.5">
      <p className={cn(subSection, "text-white text-xl leading-7 group-hover:text-landing-text-100")}>
        {post.data.title}
      </p>
      {post.data.description && (
        <p className="text-sm text-landing-text-300 leading-5 line-clamp-2">{post.data.description}</p>
      )}
      <p className={cn(microLabel, "mt-1")}>
        {formatUTCDate(post.data.date)} · {post.data.author.name}
      </p>
    </div>
  </Link>
);

export default function BlogList({ posts, routePrefix }: Props) {
  return (
    <div className="flex flex-col items-center w-full px-6 md:px-0 pt-[100px] pb-[72px] md:pb-[120px]">
      <div className={cn("flex flex-col items-start w-full gap-8", LANDING_COLUMN_MAX_W)}>
        {posts.length === 0 ? (
          <p className="text-landing-text-300 text-sm">No posts yet.</p>
        ) : (
          <div className="flex flex-col w-full">
            {posts.map((post, idx) => (
              <ListRow key={post.slug} post={post} routePrefix={routePrefix} isFirst={idx === 0} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
