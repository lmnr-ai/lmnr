import { parseAsString, useQueryState } from "nuqs";

export function useSpanId() {
  return useQueryState("spanId", parseAsString.withOptions({ history: "push" }));
}
