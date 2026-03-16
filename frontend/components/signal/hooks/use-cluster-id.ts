import { parseAsString, useQueryState } from "nuqs";

export function useClusterId() {
  return useQueryState("clusterId", parseAsString.withOptions({ history: "push" }));
}
