import { useCallback, useEffect, useMemo, useRef } from "react";

import { useProjectContext } from "@/contexts/project-context";
import { fetchApi } from "@/lib/api/fetch-api";
import { useToast } from "@/lib/hooks/use-toast";
import { type TraceHealthCheckId } from "@/lib/trace-health/checks";

const EMPTY: string[] = [];

/** Project-wide hidden trace health checks, stored in `projects.settings.hiddenTraceHealthChecks`. */
export function useHiddenChecks() {
  const { toast } = useToast();
  const { project, mutateProject } = useProjectContext();
  const stored = project?.settings.hiddenTraceHealthChecks ?? EMPTY;
  const hidden = useMemo(() => new Set(stored), [stored]);

  // Each PATCH sends the FULL list, so writes are chained in click order and read the
  // latest list from a ref; otherwise a slower older write could land last and drop a newer hide.
  const listRef = useRef(stored);
  useEffect(() => {
    listRef.current = stored;
  }, [stored]);
  const writeChainRef = useRef<Promise<unknown>>(Promise.resolve());

  const setList = useCallback(
    (next: string[]) => {
      listRef.current = next;
      mutateProject((cur) => (cur ? { ...cur, settings: { ...cur.settings, hiddenTraceHealthChecks: next } } : cur), {
        revalidate: false,
      });
    },
    [mutateProject]
  );

  const setHidden = useCallback(
    (id: TraceHealthCheckId, hide: boolean) => {
      const without = (list: string[]) => list.filter((c) => c !== id);
      setList(hide ? [...without(listRef.current), id] : without(listRef.current));

      const write = async () => {
        const { error } = await fetchApi(`/api/projects/${project?.id}/settings`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ settings: { hiddenTraceHealthChecks: listRef.current } }),
        });
        if (error) {
          // Revert only this check, keeping concurrent changes to the others.
          setList(hide ? without(listRef.current) : [...without(listRef.current), id]);
          toast({ variant: "destructive", title: error });
        }
      };
      writeChainRef.current = writeChainRef.current.then(write, write);
    },
    [project?.id, setList, toast]
  );

  return { hidden, setHidden };
}
