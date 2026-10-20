import { LANDING_COLUMN_MAX_W, mainTitle } from "@/components/landing/class-names";
import { type BlogListItem } from "@/lib/blog/types";
import { cn } from "@/lib/utils";

import FeaturedPost from "./featured-post";
import PostCard from "./post-card";

interface Props {
  posts: BlogListItem[];
  routePrefix: "blog" | "article";
}

const HEADINGS: Record<Props["routePrefix"], string> = {
  blog: "Blog",
  article: "Articles",
};

// Newest post as a full-width hero, the rest in a uniform two-column card grid.
export default function BlogList({ posts, routePrefix }: Props) {
  const [featured, ...rest] = posts;

  return (
    <div className="flex flex-col items-center w-full px-6 md:px-0 pt-[100px] pb-[72px] md:pb-[120px]">
      <div className={cn("flex flex-col w-full gap-12", LANDING_COLUMN_MAX_W)}>
        <h1 className={mainTitle}>{HEADINGS[routePrefix]}</h1>
        {!featured ? (
          <p className="text-foreground-300 text-sm">No posts yet.</p>
        ) : (
          <>
            <FeaturedPost post={featured} routePrefix={routePrefix} />
            {rest.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-14 pt-12 border-t border-surface-300">
                {rest.map((post) => (
                  <PostCard key={post.slug} post={post} routePrefix={routePrefix} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
