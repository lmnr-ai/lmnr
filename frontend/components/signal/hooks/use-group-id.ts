import { parseAsString, useQueryState } from "nuqs";

export function useGroupId() {
  return useQueryState("groupId", parseAsString.withOptions({ history: "push" }));
}
