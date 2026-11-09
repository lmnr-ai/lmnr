import { useEffect, useMemo, useRef, useState } from "react";

import { type SearchableSource } from "@/components/traces/span-view/searchable";
import { searchPattern } from "@/components/traces/span-view/searchable/find-matches";
import { useSpanSearchRegistration } from "@/components/traces/span-view/span-search-context";

import { type ConversationRow, type SectionKey } from "./build-rows";
import {
  buildTurnSearchIndex,
  locateMatch,
  matchTurn,
  type SectionText,
  type TurnMatches,
  type TurnSearchIndex,
} from "./search-index";
import { type ActiveMatch } from "./use-row-search-scope";

const SOURCE_ID = "span-turn";

export interface ActiveRowMatch extends ActiveMatch {
  key: string;
}

const sum = (counts?: number[]) => counts?.reduce((a, b) => a + b, 0) ?? 0;

/**
 * Registers the whole conversation as one search source, counted from the text index rather than mounted editors.
 * `allRows` is the list with the context open, so matches in folded messages count (and a jump into one opens it).
 */
export const useTurnSearch = (allRows: ConversationRow[], sections: Record<SectionKey, SectionText>) => {
  const registration = useSpanSearchRegistration();
  const [matches, setMatches] = useState<TurnMatches>();
  const [active, setActive] = useState<ActiveRowMatch>();
  const nonce = useRef(0);

  // Built on the first search only: rendering every part's text is the expensive step.
  const index = useMemo(() => {
    let built: TurnSearchIndex | undefined;
    return () => (built ??= buildTurnSearchIndex(allRows, sections));
  }, [allRows, sections]);

  useEffect(() => {
    if (!registration) return;
    let current: TurnMatches | undefined;
    const source: SearchableSource = {
      id: SOURCE_ID,
      messageIndex: 0,
      contentPartIndex: 0,
      apply(term) {
        const pattern = searchPattern(term);
        current = pattern ? matchTurn(index(), pattern) : undefined;
        setMatches(current);
        setActive(undefined);
        return current?.total ?? 0;
      },
      goTo(global) {
        const hit = current && locateMatch(current, global);
        if (hit) setActive({ ...hit, nonce: ++nonce.current });
      },
      clearActive() {
        setActive(undefined);
      },
      destroy() {
        current = undefined;
        setMatches(undefined);
        setActive(undefined);
      },
    };
    registration.registerSource(source);
    return () => registration.unregisterSource(SOURCE_ID);
  }, [registration, index]);

  const contextHits = useMemo(
    () =>
      matches &&
      allRows.reduce(
        (total, row) => (row.kind === "message" && row.inContext ? total + sum(matches.byRow.get(row.key)) : total),
        0
      ),
    [matches, allRows]
  );

  const activeInContext = useMemo(
    () => !!active && allRows.some((row) => row.key === active.key && row.kind === "message" && row.inContext),
    [active, allRows]
  );

  return { matches, active, contextHits, activeInContext };
};
