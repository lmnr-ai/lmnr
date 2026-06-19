import { parseAsString, useQueryState } from "nuqs";

export function useEmergingClusterId() {
  return useQueryState("emergingClusterId", parseAsString.withOptions({ history: "push" }));
}
