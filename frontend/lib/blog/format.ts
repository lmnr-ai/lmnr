export const formatCategoryLabel = (category?: string | null): string => {
  if (!category) return "Post";
  return category.charAt(0).toUpperCase() + category.slice(1);
};
