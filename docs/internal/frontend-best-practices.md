# Frontend best practices (components, tables, stores)

<!-- Detailed working notes for coding agents and developers. -->
<!-- Referenced from the index in the repo-root CLAUDE.md; read when working in this area. -->
<!-- Sibling files in docs/internal/ may be cross-referenced by section name. -->

## Frontend Best Practices

### One component per file

Related components should be in a folder named by the parent component (`my-list/`) and the parent component should follow the index.tsx pattern (`my-list/index.tsx`) and all related components should be in the folder (`my-list/my-list-item.tsx`).

Please do your best to keep components <150 lines.

### Writing a new data table (rendering-perf pattern)

New tables built on `InfiniteDataTable` MUST follow the split established for traces/sessions/spans/queues/etc. (`components/traces/traces-table/`, `sessions-table/`, `spans-table/`, `signal/events-table/`, `datasets/`, `evaluations/`, `playgrounds/`, …). Do NOT put fetching + controls + `<InfiniteDataTable>` in one component — the virtualized body then re-renders on every filter/search/URL keystroke. Structure:

- **`constants.ts`** — `FETCH_SIZE`, `RESOURCE`, chart-bar counts, and any other magic values (no inline literals in the components).
- **`index.tsx`** — a thin `default export` that mounts `<InfiniteDataTableProvider>` and renders an inner `*TableContent` component. `*TableContent` owns all the **volatile** state (URL params via `useSearchParams`, `useTableView()` effective filters/search/sort, custom columns) and the memoized handlers (`useCallback`/`useMemo` for `onSort`, `onRefresh`, column defs, filter arrays). It passes those down as **stable props** to `*TableContents` and renders `*TableControls` as its **`children`**.
- **`table-contents.tsx`** — `export const XTableContents = memo(function …)`. Owns data fetching (`useInfiniteScroll`, `useRealtime`) and renders `<InfiniteDataTable>`, forwarding `{children}` through to it. This is the component whose re-renders are expensive, so every prop it takes must be memoized upstream and it is wrapped in `memo`.
- **`table-controls.tsx`** — the toolbar/filter/search/chart JSX (`DataTableFilter`, `AdvancedSearch`, `ViewsToolbar`, `DateRangeFilter`, `RefreshButton`, columns menu, charts). It re-renders freely on filter/search changes; because it's rendered as `children` inside a separate `<div>` in `InfiniteDataTable`, its churn doesn't touch the virtualized rows.

Row/cell memoization lives inside `InfiniteDataTable` (row + cell are `memo`'d with custom comparators) — you get it for free. Your job is only to (a) keep the props you pass into `*TableContents` referentially stable, and (b) keep cell components cheap (see the tooltip rule below). For a heavy custom virtualized list outside the datatable (e.g. the trace-view transcript), apply the same idea: a `memo`'d row component with a hand-written comparator that checks only the fields that row actually reads.

### Tooltips in table cells / hot render paths

There is ONE app-wide `<TooltipProvider>` in `app/layout.tsx`. Cell components (and anything rendered per-row) MUST NOT wrap their tooltip in a local `<TooltipProvider>` — that mounts a provider per cell and is a measurable render cost at 50 rows × N columns. Use a bare `<Tooltip delayDuration={…}>` (delay goes on the `Tooltip`, not a provider) with `<TooltipTrigger>` + `<TooltipPortal><TooltipContent/></TooltipPortal>`. Same rule for shared cell-level components (`CopyTooltip`, `JsonTooltip`, `ClientTimestampFormatter`, tag/cost/tokens/duration cells).

### Bias towards complex logic and state in the Zustand store

When you anticipate lots of complex state management with useState and useEffects, this would be a good time to rethink or refactor and move state into a shared store and expose derived state via selectors.

### Avoid syncing URL params with Zustand store antipattern

Use the nuqs library to handle url param state when possible. Avoid using a useEffect to sync URL param state with the Zustand store. Prefer keeping source of truth as the useQueryState and passing in necessary state as function params to the store when needed.

### Use Zustand shallow to avoid unnecessary rerenders

Pass shallow as the equality function to useStore when applicable. That way even with a new selector reference each render, Zustand compares the result shallowly and won't re-render if the contents are the same.

### AbortController

Use an `AbortController` to cancel in-flight `fetch` requests when a newer request supersedes them, or when the component/store state they would update has moved on. Pass the controller's `signal` to `fetch`; the browser rejects with an `AbortError`, so bail in the catch without touching state. Prefer this over hand-rolled "snapshot state at start, compare at resolve, discard if drifted" patterns — it's the standard primitive and it cancels the actual request, not just its effect on state.

Use it for: an older response overwriting newer state (user paginates, then changes the filter — page 1 resolves after page 0 and splices stale rows onto fresh data), wasted network/server work, and rapid user actions (repeated scrolls, debounce-escaped clicks, search typing) where only the latest result should land.

**The reference implementation is `fetchNextTablePage` / `executeQuery` in `frontend/components/dashboards/editor/dashboard-editor-store.tsx`** — a per-store-instance controller ref in closure scope (not module scope, so instances can't cancel each other). Four non-obvious rules it encodes:

- Do NOT reset loading flags in the abort branch of the catch. Whoever aborted you owns the next state, and resetting races with it.
- Conversely, when one action aborts another, the ABORTING action must clear any loading flag the aborted one left behind.
- In the `finally`, only null out the shared controller ref if it still points at your own controller — otherwise a newer operation has already replaced it and you'd clobber its handle.
- On the success path use functional `set((state) => ...)` rather than closing over `state.data`, so you merge with the latest value rather than a snapshot.

### Error handling

**Client-side fetch calls** (in `"use client"` components): Always wrap `fetch` calls in `try/catch`. Check `res.ok` before using the response. On error, show a toast notification to the user via `useToast()`. Extract the error message from the response JSON when available, falling back to a generic message.

```typescript
try {
  const res = await fetch(`/api/projects/${projectId}/resource`, { method: "POST", body: JSON.stringify(data) });
  if (!res.ok) {
    const errMessage = await res.json().then((d) => d?.error).catch(() => null);
    toast({ variant: "destructive", title: errMessage ?? "Something went wrong" });
    return;
  }
  // handle success
} catch {
  toast({ variant: "destructive", title: "Something went wrong" });
}
```

**API route handlers** (`app/api/**/route.ts`): Wrap the handler body in `try/catch`. Distinguish `ZodError` (return 400 with `prettifyError()`) from other errors (return 500). Always return a JSON response with an `error` field.

```typescript
try {
  const result = await someAction(input);
  return Response.json(result);
} catch (error) {
  if (error instanceof ZodError) {
    return Response.json({ error: prettifyError(error) }, { status: 400 });
  }
  return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
}
```

**Server components** (`page.tsx`): Let database/fetch errors propagate to the nearest `error.tsx` error boundary — do **not** catch them and convert to `notFound()`. Only use `try/catch` or `.catch()` when you need a specific fallback value for optional data. Use `notFound()` only for genuinely missing resources (i.e. when a query returns `null`/`undefined`).
