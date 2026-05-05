"use client";

import { useMemo, useState } from "react";

import BlogCard from "@/components/blog/blog-card";
import CategoryFilter, { type CategoryOption } from "@/components/blog/category-filter";
import { type BlogListItem } from "@/lib/blog/types";

interface BlogIndexProps {
  featured?: BlogListItem;
  recent: BlogListItem[];
  rest: BlogListItem[];
  categories: CategoryOption[];
  routePrefix?: string;
}

const PAGE_SIZE = 12;

export default function BlogIndex({ featured, recent, rest, categories, routePrefix = "blog" }: BlogIndexProps) {
  const [category, setCategory] = useState<string>("all");
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);

  const categoryOf = (post: BlogListItem) => (post.tags?.[0] ?? "").toLowerCase();

  const filteredRest = useMemo(() => {
    if (category === "all") return rest;
    return rest.filter((p) => categoryOf(p) === category);
  }, [rest, category]);

  const visible = filteredRest.slice(0, visibleCount);
  const hasMore = visible.length < filteredRest.length;

  const handleCategoryChange = (next: string) => {
    setCategory(next);
    setVisibleCount(PAGE_SIZE);
  };

  return (
    <>
      {featured && (
        <section className="pt-8 pb-16 md:pb-24">
          <div className="max-w-6xl mx-auto px-4">
            <BlogCard post={featured} variant="featured" routePrefix={routePrefix} category={categoryOf(featured)} />
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section className="pb-16 md:pb-24">
          <div className="max-w-6xl mx-auto px-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {recent.map((post) => (
                <BlogCard
                  key={post.slug}
                  post={post}
                  variant="default"
                  routePrefix={routePrefix}
                  category={categoryOf(post)}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {categories.length > 1 && (
        <section className="pb-8 md:pb-12">
          <div className="max-w-6xl mx-auto px-4">
            <CategoryFilter categories={categories} value={category} onChange={handleCategoryChange} />
          </div>
        </section>
      )}

      <section className="pb-16 md:pb-24">
        <div className="max-w-6xl mx-auto px-4">
          {visible.length === 0 ? (
            <p className="text-landing-text-400 py-12 text-center">No posts in this category yet.</p>
          ) : (
            <ul className="flex flex-col border-t border-landing-surface-500">
              {visible.map((post) => (
                <li key={post.slug}>
                  <BlogCard post={post} variant="compact" routePrefix={routePrefix} category={categoryOf(post)} />
                </li>
              ))}
            </ul>
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
