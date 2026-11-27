import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";

import { byDomOrder, type SearchableSource } from "@/components/traces/span-view/searchable";
import { type SpanSearchRegistrationContextValue } from "@/components/traces/span-view/span-search-context";

/** The current match, when it is in this row. */
export interface ActiveMatch {
  /** Its position among the row's matches, in DOM order. */
  local: number;
  /** New on every navigation, so landing on the same match again scrolls again. */
  nonce: number;
}

/** Returns whether to scroll to the match: only the first time a navigation lands, not when its row remounts. */
export type ClaimReveal = (nonce: number) => boolean;

interface Entry {
  source: SearchableSource;
  count: number;
}

/**
 * Collects one row's mounted editors: applies the search term to them and puts the row's current match (the index
 * counted it) in the editor that holds it. Editors can mount after the row does (expanded parts, late CodeMirror
 * creation), so every registration resolves the current match again, batched per frame.
 */
export const useRowSearchScope = (
  term: string,
  active: ActiveMatch | undefined,
  claim: ClaimReveal | undefined
): SpanSearchRegistrationContextValue => {
  const sources = useRef(new Map<string, Entry>());
  const latest = useRef({ term, active, claim });
  const frame = useRef(0);

  useLayoutEffect(() => {
    latest.current = { term, active, claim };
  }, [term, active, claim]);

  const resolve = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const { active, claim } = latest.current;
      let remaining = active?.local ?? -1;
      let target: { entry: Entry; local: number } | undefined;
      for (const entry of [...sources.current.values()].sort((a, b) => byDomOrder(a.source, b.source))) {
        if (!target && remaining >= 0 && remaining < entry.count) {
          target = { entry, local: remaining };
          continue;
        }
        if (!target) remaining -= entry.count;
        entry.source.clearActive();
      }
      if (target && active) target.entry.source.goTo(target.local, claim?.(active.nonce) ?? false);
    });
  }, []);

  useEffect(() => {
    sources.current.forEach((entry) => {
      entry.count = entry.source.apply(term);
    });
    resolve();
  }, [term, resolve]);

  useEffect(() => resolve(), [active, resolve]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const registerSource = useCallback(
    (source: SearchableSource) => {
      const existing = sources.current.get(source.id);
      if (existing && existing.source !== source) existing.source.destroy();
      sources.current.set(source.id, { source, count: source.apply(latest.current.term) });
      resolve();
    },
    [resolve]
  );

  const unregisterSource = useCallback((id: string) => {
    sources.current.get(id)?.source.destroy();
    sources.current.delete(id);
  }, []);

  return useMemo(() => ({ registerSource, unregisterSource }), [registerSource, unregisterSource]);
};
