import { type PropsWithChildren } from "react";

import { SpanSearchRegistrationScope, useSpanSearchState } from "@/components/traces/span-view/span-search-context";

import { type ActiveMatch, type ClaimReveal, useRowSearchScope } from "./use-row-search-scope";

interface RowSearchScopeProps {
  active?: ActiveMatch;
  claim?: ClaimReveal;
}

const Scope = ({ active, claim, term, children }: PropsWithChildren<RowSearchScopeProps & { term: string }>) => {
  const scope = useRowSearchScope(term, active, claim);
  return <SpanSearchRegistrationScope value={scope}>{children}</SpanSearchRegistrationScope>;
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
