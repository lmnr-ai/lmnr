import { type PropsWithChildren } from "react";

import {
  SpanSearchHitsProvider,
  SpanSearchRegistrationScope,
  useSpanSearchState,
} from "@/components/traces/span-view/span-search-context";

import { type ActiveMatch, type ClaimReveal, useRowSearchScope } from "./use-row-search-scope";

interface RowSearchScopeProps {
  /** The row's match counts per part; undefined when it has none. */
  hits?: readonly number[];
  active?: ActiveMatch;
  claim?: ClaimReveal;
}

const Scope = ({ hits, active, claim, term, children }: PropsWithChildren<RowSearchScopeProps & { term: string }>) => {
  const scope = useRowSearchScope(term, active, claim);
  return (
    <SpanSearchHitsProvider value={hits}>
      <SpanSearchRegistrationScope value={scope}>{children}</SpanSearchRegistrationScope>
    </SpanSearchHitsProvider>
  );
};

/** Routes a row's editors to the row instead of the span-wide search, which counts matches from the index. */
const RowSearchScope = ({ children, ...props }: PropsWithChildren<RowSearchScopeProps>) => {
  const state = useSpanSearchState();
  if (!state) return children;
  return (
    <Scope {...props} term={state.searchTerm}>
      {children}
    </Scope>
  );
};

export default RowSearchScope;
