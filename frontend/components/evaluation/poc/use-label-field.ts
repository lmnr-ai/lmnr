"use client";

import { useEffect, useRef, useState } from "react";

interface UseLabelFieldResult {
  fieldPath: string | null;
  isLoading: boolean;
}

/**
 * Fires the label-field POST exactly ONCE per mount — mirrors the
 * transcript-previews "LLM picks a key once" pattern. The server fetches its
 * own (untruncated) sample rows, so no row data rides the request. Manual
 * fetch (not SWR): nothing to revalidate — the server side is itself cached
 * for 7 days.
 */
export function useLabelField(projectId: string, evaluationId: string): UseLabelFieldResult {
  const [fieldPath, setFieldPath] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;

    setIsLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/evaluations/${evaluationId}/label-field`, {
          method: "POST",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { fieldPath: string | null };
        setFieldPath(data.fieldPath ?? null);
      } catch {
        // Best-effort — every consumer already falls back to a data preview.
      } finally {
        setIsLoading(false);
      }
    })();
  }, [projectId, evaluationId]);

  return { fieldPath, isLoading };
}
