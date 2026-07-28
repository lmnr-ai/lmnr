"use client";

import { useCallback, useMemo, useRef } from "react";
import useSWR from "swr";

import { useProjectContext } from "@/contexts/project-context";
import { type ScoreDirectionDefaults } from "@/lib/actions/evaluation/score-directions";
import { useToast } from "@/lib/hooks/use-toast";
import { swrFetcher } from "@/lib/utils";

const EMPTY: Record<string, boolean> = {};

export interface UseScoreDirections {
  /** Resolved map: score name -> isHigherBetter (override > LLM default > true). */
  resolved: Record<string, boolean>;
  /** Resolved direction for a score name. Defaults to true (higher is better). */
  isHigherBetter: (scoreName: string) => boolean;
  /** Flip the resolved direction and persist it as a project override. */
  toggle: (scoreName: string) => void;
}

/**
 * Two independent layers:
 *   - Override layer (project-scoped, manual): seeded from ProjectContext so it
 *     is available IMMEDIATELY and is clickable right away. Held in SWR's module
 *     cache (per project) so toggles are optimistic + reactive AND survive hook
 *     remounts across soft navigation.
 *   - Default layer (app-wide, LLM-inferred): fetched async via SWR; may be
 *     pending while the LLM classifies uncached names. If it resolves behind an
 *     existing override it's a no-op to the user (the override wins) — but the
 *     LLM suggestion is still cached server-side for everyone.
 * Resolved = override ?? LLM default ?? true.
 */
export function useScoreDirections(projectId: string, scoreNames: string[]): UseScoreDirections {
  const { toast } = useToast();
  const seededOverrides = useProjectContext().project?.settings.scoreDirectionOverrides ?? EMPTY;

  // Override layer lives in SWR's module cache (not useState) so it survives
  // hook remounts across soft navigation — ProjectContext is a frozen server
  // prop that never reflects a write, so re-seeding from it on every remount
  // dropped prior toggles and let the next full-map PATCH clobber them. Null
  // fetcher: this is a client-owned store, seeded once from the SSR prop and
  // written only via `mutateOverrides`. Cache key is per project.
  const overridesKey = `score-direction-overrides:${projectId}`;
  const { data: overrides = EMPTY, mutate: mutateOverrides } = useSWR<Record<string, boolean>>(overridesKey, null, {
    fallbackData: seededOverrides,
  });

  // App-wide LLM default layer — async, no bearing on when the user can toggle.
  const key = useMemo(() => {
    const names = [...new Set(scoreNames)].filter((n) => n.length > 0).sort();
    if (names.length === 0) return null;
    const qs = names.map((n) => `name=${encodeURIComponent(n)}`).join("&");
    return `/api/projects/${projectId}/evaluations/score-directions?${qs}`;
  }, [projectId, scoreNames]);

  const { data } = useSWR<{ defaults: ScoreDirectionDefaults }>(key, swrFetcher, { revalidateOnFocus: false });
  const defaults = data?.defaults ?? EMPTY;

  const resolved = useMemo(() => ({ ...defaults, ...overrides }), [defaults, overrides]);
  const isHigherBetter = useCallback(
    (scoreName: string) => overrides[scoreName] ?? defaults[scoreName] ?? true,
    [overrides, defaults]
  );

  // Synchronous source of truth for the override map + a promise chain so
  // overlapping toggles PATCH strictly in click order. The write always carries
  // the FULL map (JSONB `||` replaces the whole scoreDirectionOverrides value),
  // so without ordering a slower older request could land last and drop a newer
  // key. The ref must be updated SYNCHRONOUSLY on every mutation (not just at
  // render): a chained write's microtask reads it before React re-renders, so a
  // render-only sync would let a write serialize a value the catch just reverted.
  const overridesRef = useRef(overrides);
  overridesRef.current = overrides; // safety net; setBoth keeps it current in-flight
  const writeChainRef = useRef<Promise<unknown>>(Promise.resolve());

  // Update the ref (synchronous reads) and the SWR cache (render) together.
  // revalidate:false — there is no fetcher; this only writes the local store.
  const setBoth = useCallback(
    (updater: (cur: Record<string, boolean>) => Record<string, boolean>) => {
      const next = updater(overridesRef.current);
      overridesRef.current = next;
      mutateOverrides(next, { revalidate: false });
    },
    [mutateOverrides]
  );

  const toggle = useCallback(
    (scoreName: string) => {
      const cur = overridesRef.current;
      const next = !(cur[scoreName] ?? defaults[scoreName] ?? true);
      const hadKey = scoreName in cur;
      const prevValue = cur[scoreName];
      setBoth((c) => ({ ...c, [scoreName]: next })); // optimistic + reactive

      const write = async () => {
        try {
          const res = await fetch(`/api/projects/${projectId}/settings`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            // Send the LATEST full map (reflecting any earlier revert), not the
            // click-time snapshot, so client and server converge under ordering.
            body: JSON.stringify({ settings: { scoreDirectionOverrides: overridesRef.current } }),
          });
          if (!res.ok) {
            const errMessage = await res
              .json()
              .then((d) => d?.error)
              .catch(() => null);
            throw new Error(errMessage ?? "Failed to update score direction");
          }
        } catch (e) {
          // Revert ONLY this score, preserving concurrent edits to other scores.
          // Sync the ref too so a chained write serializes the reverted map.
          setBoth((s) => {
            const r = { ...s };
            if (hadKey) r[scoreName] = prevValue as boolean;
            else delete r[scoreName];
            return r;
          });
          toast({
            variant: "destructive",
            title: e instanceof Error ? e.message : "Failed to update score direction",
          });
        }
      };

      // Chain so writes never overlap; `.then(write, write)` runs regardless of
      // whether the previous write resolved or rejected.
      writeChainRef.current = writeChainRef.current.then(write, write);
    },
    [projectId, defaults, toast, setBoth]
  );

  return { resolved, isHigherBetter, toggle };
}
