"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type ColumnSuggestion,
  pendingRecord,
  resolveColumnSuggestions,
  resolvedRecord,
  type SuggestionRecord,
} from "./resolve";

export type { ColumnSuggestion } from "./resolve";

const keyFor = (resource: string, scopeId: string) => `column-suggestions:${resource}:${scopeId}`;

// Bounded retry for transient generation failures (empty / streaming eval): ~5
// attempts over ~20s covers realtime datapoint arrival, then stops so a
// genuinely-empty eval doesn't poll forever.
const SUGGESTION_MAX_RETRIES = 5;
const SUGGESTION_RETRY_DELAY_MS = 4000;

type PersistedMap = Record<string, SuggestionRecord>;

function loadPersisted(storageKey: string): PersistedMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as PersistedMap) : {};
  } catch {
    return {};
  }
}

function savePersisted(storageKey: string, map: PersistedMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(map));
  } catch {
    // Best-effort — localStorage may be unavailable / full.
  }
}

export interface UseColumnSuggestionsArgs {
  /** Table family, e.g. "evaluations". Part of the localStorage key. */
  resource: string;
  /** Scope within the resource, e.g. the evaluation id. Part of the key. */
  scopeId: string;
  suggestions: ColumnSuggestion[];
  /** IDs of columns already on the table (custom + built-in) — collision guard. */
  existingColumnIds: string[];
  /** suggestionKeys of existing custom columns (kept-and-saved / cross-user guard). */
  existingSuggestionKeys: string[];
  /** True where suggestions must never appear (e.g. shared evals). */
  disabled: boolean;
  /** Called when the user keeps a suggestion: promote it to a real column. */
  onKeep: (suggestion: ColumnSuggestion, sql: string) => void;
  /** Called when a generation fails transiently (for a user-facing toast). */
  onError?: (suggestion: ColumnSuggestion) => void;
}

export interface ActiveSuggestion {
  suggestion: ColumnSuggestion;
  sql: string;
}

export interface UseColumnSuggestionsResult {
  /** Suggestions to render right now (pending, with generated sql). */
  active: ActiveSuggestion[];
  keep: (id: string) => void;
  discard: (id: string) => void;
}

/**
 * Owns the suggestion lifecycle: localStorage persistence, one-shot generation
 * of eligible suggestions, and keep/discard. The decision rules live in the
 * pure `resolveColumnSuggestions`; this hook is the IO + async wrapper.
 */
export function useColumnSuggestions({
  resource,
  scopeId,
  suggestions,
  existingColumnIds,
  existingSuggestionKeys,
  disabled,
  onKeep,
  onError,
}: UseColumnSuggestionsArgs): UseColumnSuggestionsResult {
  const storageKey = useMemo(() => keyFor(resource, scopeId), [resource, scopeId]);
  // Read once at mount via a lazy initializer (SSR-safe: returns {} on the
  // server; the client re-runs it at hydration and reads localStorage). Consumers
  // MUST remount the hook per scope — the eval page keys its providers on the
  // evaluation id, the established pattern here — so a fresh `scopeId` gets a
  // fresh read. FOOTGUN: `persisted` and `attempted` are captured at mount and
  // never reset on prop change, so if a caller ever changes `scopeId` WITHOUT
  // remounting, it will show the prior scope's cache and block generation.
  const [persisted, setPersisted] = useState<PersistedMap>(() => loadPersisted(storageKey));

  const setRecord = useCallback(
    (id: string, record: SuggestionRecord) => {
      setPersisted((prev) => {
        const next = { ...prev, [id]: record };
        savePersisted(storageKey, next);
        return next;
      });
    },
    [storageKey]
  );

  const resolution = useMemo(
    () => resolveColumnSuggestions({ suggestions, existingColumnIds, existingSuggestionKeys, persisted, disabled }),
    [suggestions, existingColumnIds, existingSuggestionKeys, persisted, disabled]
  );

  // Run generation for eligible suggestions once per mount. Each run gets its own
  // AbortController so it can be cancelled when the hook unmounts (e.g. navigating
  // to another eval) — the generation is a multi-second agent call.
  const attempted = useRef<Set<string>>(new Set());
  const controllers = useRef<Map<string, AbortController>>(new Map());
  // Transient failures (most commonly an empty / still-streaming eval) are retried
  // WITHIN the mount: `attempted` is cleared and a bounded delayed `retryNonce`
  // bump re-runs the effect, so the suggestion appears once realtime datapoints
  // arrive without a remount. Capped so a genuinely-empty eval never polls forever.
  const retryCounts = useRef<Map<string, number>>(new Map());
  const retryTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    if (disabled) return;
    for (const suggestion of resolution.toGenerate) {
      if (attempted.current.has(suggestion.id)) continue;
      attempted.current.add(suggestion.id);
      const controller = new AbortController();
      controllers.current.set(suggestion.id, controller);
      suggestion
        .generate(controller.signal)
        .then((res) => {
          // {sql} -> pending; null -> definitive "no identifier" -> resolved.
          setRecord(suggestion.id, res && res.sql.trim() ? pendingRecord(res.sql) : resolvedRecord());
        })
        .catch(() => {
          // Aborted (unmount / nav): stay silent, don't persist.
          if (controller.signal.aborted) return;
          onError?.(suggestion);
          // Transient failure — unblock and schedule a bounded retry so a
          // streaming eval's suggestion appears once rows land, without a remount.
          const count = retryCounts.current.get(suggestion.id) ?? 0;
          if (count >= SUGGESTION_MAX_RETRIES) return;
          retryCounts.current.set(suggestion.id, count + 1);
          attempted.current.delete(suggestion.id);
          const timer = setTimeout(() => {
            retryTimers.current.delete(timer);
            setRetryNonce((n) => n + 1);
          }, SUGGESTION_RETRY_DELAY_MS);
          retryTimers.current.add(timer);
        })
        .finally(() => {
          controllers.current.delete(suggestion.id);
        });
    }
  }, [resolution.toGenerate, disabled, setRecord, onError, retryNonce]);

  // Abort any in-flight generation on unmount so it can't run on / setState a
  // dead component (and the server call is cancelled). Also clear pending retry
  // timers so a scheduled retry can't setState after unmount.
  useEffect(() => {
    const map = controllers.current;
    const timers = retryTimers.current;
    return () => {
      for (const c of map.values()) c.abort();
      map.clear();
      for (const t of timers) clearTimeout(t);
      timers.clear();
    };
  }, []);

  const keep = useCallback(
    (id: string) => {
      const entry = resolution.toShow.find((s) => s.suggestion.id === id);
      if (entry) onKeep(entry.suggestion, entry.sql);
      // Deliberately NO resolved localStorage write here. onKeep only adds the
      // column to the (unsaved) view config; resolve already hides the suggestion
      // in-session via existingColumnIds and cross-session via existingSuggestionKeys
      // once the view is saved. Persisting "resolved" now would suppress the
      // suggestion forever if the add is rolled back (refresh / eval switch /
      // discard changes before save) — the column would be gone but Label never
      // returns. discard() is the only path that persists resolved.
    },
    [resolution.toShow, onKeep]
  );

  const discard = useCallback((id: string) => setRecord(id, resolvedRecord()), [setRecord]);

  return { active: resolution.toShow, keep, discard };
}
