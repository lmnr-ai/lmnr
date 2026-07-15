export { createCodeMirrorSearchSource } from "@/components/traces/span-view/searchable/codemirror-source";
export { createDomSearchSource } from "@/components/traces/span-view/searchable/dom-source";
export type { MatchOffset } from "@/components/traces/span-view/searchable/find-matches";
export {
  buildSearchRegex,
  countMatches,
  findMatchOffsets,
} from "@/components/traces/span-view/searchable/find-matches";
export type { SearchableSource } from "@/components/traces/span-view/searchable/types";
