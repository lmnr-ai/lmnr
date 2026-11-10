import { type SearchableSource } from "@/components/traces/span-view/searchable/types";

/** Page order, so match numbers follow reading order; sources without an element keep registration order. */
export const byDomOrder = (a: SearchableSource, b: SearchableSource): number => {
  const [x, y] = [a.element, b.element];
  if (!x || !y || x === y) return 0;
  return x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
};
