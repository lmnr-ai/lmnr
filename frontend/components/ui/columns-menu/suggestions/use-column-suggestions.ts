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
  /** Names of columns already on the table (custom + built-in) — collision guard. */
  existingColumnNames: string[];
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
  existingColumnNames,
  existingSuggestionKeys,
  disabled,
  onKeep,
  onError,
}: UseColumnSuggestionsArgs): UseColumnSuggestionsResult {
  const storageKey = useMemo(() => keyFor(resource, scopeId), [resource, scopeId]);
  // Read once at mount via a lazy initializer (SSR-safe: returns {} on the
  // server). Consumers are expected to remount the hook per scope — the eval
  // page keys its providers on the evaluation id, the established pattern here —
  // so a fresh `scopeId` gets a fresh read without a set-state-in-effect reload.
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
    () => resolveColumnSuggestions({ suggestions, existingColumnNames, existingSuggestionKeys, persisted, disabled }),
    [suggestions, existingColumnNames, existingSuggestionKeys, persisted, disabled]
  );

  // Run generation for eligible suggestions exactly once per mount. Each run gets
  // its own AbortController so it can be cancelled when the hook unmounts (e.g.
  // navigating to another eval) — the generation is a multi-second agent call.
  const attempted = useRef<Set<string>>(new Set());
  const controllers = useRef<Map<string, AbortController>>(new Map());

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
          // Aborted (unmount / nav): stay silent, don't persist. Otherwise it's a
          // transient failure: surface via onError and retry next mount.
          if (controller.signal.aborted) return;
          onError?.(suggestion);
        })
        .finally(() => {
          controllers.current.delete(suggestion.id);
        });
    }
  }, [resolution.toGenerate, disabled, setRecord, onError]);

  // Abort any in-flight generation on unmount so it can't run on / setState a
  // dead component (and the server call is cancelled).
  useEffect(() => {
    const map = controllers.current;
    return () => {
      for (const c of map.values()) c.abort();
      map.clear();
    };
  }, []);

  const keep = useCallback(
    (id: string) => {
      const entry = resolution.toShow.find((s) => s.suggestion.id === id);
      if (entry) onKeep(entry.suggestion, entry.sql);
      setRecord(id, resolvedRecord());
    },
    [resolution.toShow, onKeep, setRecord]
  );

  const discard = useCallback((id: string) => setRecord(id, resolvedRecord()), [setRecord]);

  return { active: resolution.toShow, keep, discard };
}
