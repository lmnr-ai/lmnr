const ABS_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export const formatBlogDate = (input: string | Date): string => {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "";
  return ABS_FORMATTER.format(date);
};

export const formatCategoryLabel = (category?: string | null): string => {
  if (!category) return "Post";
  return category.charAt(0).toUpperCase() + category.slice(1);
};
