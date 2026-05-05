"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import BlogCard from "@/components/blog/blog-card";
import CategoryFilter, { type CategoryOption } from "@/components/blog/category-filter";
import { type BlogListItem } from "@/lib/blog/types";
import { cn } from "@/lib/utils";

interface BlogIndexProps {
  featured?: BlogListItem;
  recent: BlogListItem[];
  rest: BlogListItem[];
  categories: CategoryOption[];
  routePrefix?: string;
}

const PAGE_SIZE = 9;

export default function BlogIndex({ featured, recent, rest, categories, routePrefix = "blog" }: BlogIndexProps) {
  const [category, setCategory] = useState<string>("all");
  const [query, setQuery] = useState<string>("");
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);

  const categoryOf = (post: BlogListItem) => (post.tags?.[0] ?? "").toLowerCase();
  const normalizedQuery = query.trim().toLowerCase();

  const matchesCategory = (post: BlogListItem) => category === "all" || categoryOf(post) === category;
  const matchesQuery = (post: BlogListItem) =>
    normalizedQuery === "" || post.data.title.toLowerCase().includes(normalizedQuery);
  const matches = (post: BlogListItem) => matchesCategory(post) && matchesQuery(post);

  const isFiltering = category !== "all" || normalizedQuery !== "";

  const visibleFeatured = !isFiltering && featured ? featured : undefined;

  const gridPosts = useMemo(() => {
    if (!isFiltering) return [...recent, ...rest];
    return [...(featured ? [featured] : []), ...recent, ...rest].filter(matches);
  }, [featured, recent, rest, category, normalizedQuery]);

  const visible = gridPosts.slice(0, visibleCount);
  const hasMore = visible.length < gridPosts.length;
  const anyVisibleHasImage = visible.some((p) => Boolean(p.data.image));
  const listVariant: "minimal" | "compact" = anyVisibleHasImage ? "minimal" : "compact";

  const handleCategoryChange = (next: string) => {
    setCategory(next);
    setVisibleCount(PAGE_SIZE);
  };

  const handleQueryChange = (next: string) => {
    setQuery(next);
    setVisibleCount(PAGE_SIZE);
  };

  return (
    <>
      {visibleFeatured && (
        <section className="pt-4 pb-16 md:pb-24">
          <div className="max-w-6xl mx-auto px-4">
            <BlogCard
              post={visibleFeatured}
              variant="featured"
              routePrefix={routePrefix}
              category={categoryOf(visibleFeatured)}
            />
          </div>
        </section>
      )}

      <section className="pb-6 md:pb-8">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            {categories.length > 1 ? (
              <CategoryFilter
                categories={categories}
                value={category}
                onChange={handleCategoryChange}
                className="md:flex-1"
              />
            ) : (
              <div className="md:flex-1" />
            )}
            <div className="relative md:w-72 md:shrink-0">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-landing-text-500"
                aria-hidden
              />
              <input
                type="search"
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                placeholder="Search posts"
                aria-label="Search posts by title"
                className={cn(
                  "w-full rounded-full border border-landing-surface-500 bg-transparent py-2 pl-9 pr-4",
                  "text-sm text-landing-text-100 placeholder:text-landing-text-500",
                  "transition-colors focus:border-landing-surface-400 focus:outline-none"
                )}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="pb-16 md:pb-24">
        <div className="max-w-6xl mx-auto px-4">
          {visible.length === 0 ? (
            <p className="text-landing-text-400 py-12 text-center">
              {normalizedQuery ? "No posts match your search." : "No posts in this category yet."}
            </p>
          ) : listVariant === "compact" ? (
            <div className="flex flex-col">
              {visible.map((post) => (
                <BlogCard
                  key={post.slug}
                  post={post}
                  variant="compact"
                  routePrefix={routePrefix}
                  category={categoryOf(post)}
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-12">
              {visible.map((post) => (
                <BlogCard
                  key={post.slug}
                  post={post}
                  variant="minimal"
                  routePrefix={routePrefix}
                  category={categoryOf(post)}
                />
              ))}
            </div>
          )}

          {hasMore && (
            <div className="flex justify-center mt-12">
              <button
                type="button"
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="inline-flex items-center justify-center rounded-sm border border-landing-text-600 px-6 py-2.5 text-sm font-medium text-landing-text-200 transition-colors hover:text-landing-text-100 hover:border-landing-text-400"
              >
                Load more
              </button>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
