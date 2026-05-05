const ABS_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const REL_FORMATTER = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export const formatBlogDate = (input: string | Date, now: Date = new Date()): string => {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "";
  const diffDays = Math.round((date.getTime() - now.getTime()) / MS_PER_DAY);
  if (Math.abs(diffDays) < 7) {
    return REL_FORMATTER.format(diffDays, "day");
  }
  return ABS_FORMATTER.format(date);
};

export const formatCategoryLabel = (category?: string | null): string => {
  if (!category) return "Post";
  return category.charAt(0).toUpperCase() + category.slice(1);
};
