import { parseAsString, useQueryState } from "nuqs";

export function useEventId() {
  return useQueryState("eventId", parseAsString.withOptions({ history: "push" }));
}
