"use client";

import { useCallback, useMemo, useState } from "react";
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
 *     is available IMMEDIATELY and is clickable right away. Held in local state
 *     so toggles are optimistic + reactive.
 *   - Default layer (app-wide, LLM-inferred): fetched async via SWR; may be
 *     pending while the LLM classifies uncached names. If it resolves behind an
 *     existing override it's a no-op to the user (the override wins) — but the
 *     LLM suggestion is still cached server-side for everyone.
 * Resolved = override ?? LLM default ?? true.
 */
export function useScoreDirections(projectId: string, scoreNames: string[]): UseScoreDirections {
  const { toast } = useToast();
  const seededOverrides = useProjectContext().project?.settings.scoreDirectionOverrides ?? EMPTY;

  // Local, immediately-available copy of the override layer (LLM-independent).
  const [overrides, setOverrides] = useState<Record<string, boolean>>(seededOverrides);

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

  const toggle = useCallback(
    (scoreName: string) => {
      const next = !(overrides[scoreName] ?? defaults[scoreName] ?? true);
      const prev = overrides;
      // The write sends the FULL overrides map (JSONB `||` shallow-merges
      // top-level keys, so a partial map would drop the other overrides).
      const newOverrides = { ...overrides, [scoreName]: next };
      setOverrides(newOverrides); // optimistic + reactive

      (async () => {
        try {
          const res = await fetch(`/api/projects/${projectId}/settings`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ settings: { scoreDirectionOverrides: newOverrides } }),
          });
          if (!res.ok) {
            const errMessage = await res
              .json()
              .then((d) => d?.error)
              .catch(() => null);
            setOverrides(prev); // revert on failure
            toast({ variant: "destructive", title: errMessage ?? "Failed to update score direction" });
          }
        } catch {
          setOverrides(prev); // revert on failure
          toast({ variant: "destructive", title: "Failed to update score direction" });
        }
      })();
    },
    [projectId, overrides, defaults, toast]
  );

  return { resolved, isHigherBetter, toggle };
}
