"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";

import {
  type ColumnSuggestion,
  pendingRecord,
  resolveColumnSuggestions,
  resolvedRecord,
  type SuggestionRecord,
} from "./resolve";

export type { ColumnSuggestion } from "./resolve";

const keyFor = (resource: string, scopeId: string) => `column-suggestions:${resource}:${scopeId}`;

// SWR error-retry bounds for transient generation failures (most commonly an
// empty / still-streaming eval): retry a few times so the suggestion appears
// once realtime datapoints land, then stop so a genuinely-empty eval doesn't
// retry forever. SWR layers its own backoff on top of the base interval.
const SUGGESTION_MAX_RETRIES = 5;
const SUGGESTION_RETRY_INTERVAL_MS = 4000;

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
  // fresh read. FOOTGUN: `persisted` is captured at mount and never reset on prop
  // change, so if a caller ever changes `scopeId` WITHOUT remounting, it will
  // show the prior scope's cache.
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

  // Generation runs as a single SWR resource keyed on the set of pending
  // suggestion ids (null when there's nothing to generate / disabled). SWR gives
  // us dedup (the same pending set can't double-fire), bounded error-retry with
  // backoff (an empty / streaming eval retries until rows land, then stops), and
  // no revalidation on focus/reconnect — replacing the old hand-rolled attempted
  // set + retry timers. SWR does NOT abort in-flight fetches, so we keep one
  // AbortController to cancel the multi-second agent call on unmount / key change.
  const abortRef = useRef<AbortController | null>(null);
  const toGenerate = resolution.toGenerate;
  const genKey =
    !disabled && toGenerate.length > 0
      ? [
          "column-suggestions:generate",
          storageKey,
          toGenerate
            .map((s) => s.id)
            .sort()
            .join(","),
        ]
      : null;

  useSWR(
    genKey,
    async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      // Persist each result as it lands; rethrow the first transient failure so
      // SWR schedules a bounded retry. Aborted calls (unmount / nav) are swallowed.
      let firstError: unknown = null;
      await Promise.all(
        toGenerate.map(async (suggestion) => {
          try {
            const res = await suggestion.generate(controller.signal);
            // {sql} -> pending; null -> definitive "no identifier" -> resolved.
            setRecord(suggestion.id, res && res.sql.trim() ? pendingRecord(res.sql) : resolvedRecord());
          } catch (e) {
            if (controller.signal.aborted) return;
            onError?.(suggestion);
            firstError ??= e;
          }
        })
      );
      if (firstError) throw firstError;
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      shouldRetryOnError: true,
      errorRetryCount: SUGGESTION_MAX_RETRIES,
      errorRetryInterval: SUGGESTION_RETRY_INTERVAL_MS,
    }
  );

  // SWR won't abort the in-flight agent call on unmount; do it ourselves so a
  // nav-away cancels the server work and can't setState a dead component.
  useEffect(() => () => abortRef.current?.abort(), []);

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
