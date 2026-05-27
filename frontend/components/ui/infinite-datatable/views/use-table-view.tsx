"use client";

import { parseAsArrayOf, parseAsString, useQueryStates } from "nuqs";
import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";

import { type Filter, FilterSchemaRelaxed } from "@/lib/actions/common/filters";
import { swrFetcher } from "@/lib/utils";

import { useLastViewStore } from "./last-view-store";
import { EMPTY_VIEW_PARAMS, paramsEqual, readParamsFromView, type ViewParams } from "./params";
import { type View } from "./types";

export interface UseViewStateOptions {
  projectId: string;
  resource: string;
}

export interface ViewStateResult {
  view: View | null;
  views: View[] | undefined;
  baseline: ViewParams;
  effective: ViewParams;
  isLoading: boolean;
  isFormDirty: boolean;
  setFilters: (filters: Filter[]) => void;
  setSearch: (search: string) => void;
  setSearchAndFilters: (next: { filters: Filter[]; search: string }) => void;
  setSort: (sortBy: string | null, sortDirection: "asc" | "desc" | null) => void;
  selectView: (view: View | null) => void;
  markSavedAs: (viewId: string) => void;
  discardForm: () => void;
}

interface RawFormState {
  v: string | null;
  filter: string[];
  search: string | null;
  sortBy: string | null;
  sortDirection: string | null;
}

function parseFilters(raw: string[]): Filter[] {
  return raw.flatMap((s) => {
    try {
      const json = JSON.parse(s);
      const result = FilterSchemaRelaxed.safeParse(json);
      return result.success ? [result.data as Filter] : [];
    } catch {
      return [];
    }
  });
}

function normalizeSortDir(raw: string | null): "asc" | "desc" | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  return lower === "asc" || lower === "desc" ? lower : null;
}

function hasFormParams(raw: RawFormState): boolean {
  return raw.filter.length > 0 || raw.search !== null || raw.sortBy !== null || raw.sortDirection !== null;
}

function parseFormToParams(raw: RawFormState): ViewParams {
  return {
    filters: parseFilters(raw.filter),
    search: raw.search ?? "",
    sortBy: raw.sortBy && raw.sortBy.length > 0 ? raw.sortBy : null,
    sortDirection: normalizeSortDir(raw.sortDirection),
  };
}

// While `hasMadeEdit`, URL is canonical even when empty — preserves "cleared all filters" state.
function computeEffective(raw: RawFormState, baseline: ViewParams, hasMadeEdit: boolean): ViewParams {
  if (hasMadeEdit || hasFormParams(raw)) return parseFormToParams(raw);
  return baseline;
}

interface FormWriteShape {
  filter: string[] | null;
  search: string | null;
  sortBy: string | null;
  sortDirection: string | null;
}

// Empty values become `null` so nuqs drops the URL key.
function toFormShape(effective: ViewParams): FormWriteShape {
  return {
    filter: effective.filters.length > 0 ? effective.filters.map((f) => JSON.stringify(f)) : null,
    search: effective.search.length > 0 ? effective.search : null,
    sortBy: effective.sortBy && effective.sortBy.length > 0 ? effective.sortBy : null,
    sortDirection: effective.sortDirection ? effective.sortDirection.toUpperCase() : null,
  };
}

export function useViewState({ projectId, resource }: UseViewStateOptions): ViewStateResult {
  const [form, setForm] = useQueryStates({
    v: parseAsString,
    filter: parseAsArrayOf(parseAsString).withDefault([]).withOptions({ clearOnDefault: true }),
    search: parseAsString.withOptions({ clearOnDefault: true }),
    sortBy: parseAsString.withOptions({ clearOnDefault: true }),
    sortDirection: parseAsString.withOptions({ clearOnDefault: true }),
  });

  // Session-scoped — lost on refresh by design.
  const [hasMadeEdit, setHasMadeEdit] = useState(false);

  const setLastViewId = useLastViewStore((s) => s.setLastViewId);
  const lastViewId = useLastViewStore((s) => s.ids[`${projectId}:${resource}`] ?? null);
  // One-shot — reactive `lastViewId` would re-arm the gate on mid-session clears.
  const [hadLastViewIdAtMount] = useState<boolean>(() => lastViewId !== null);

  const listKey = `/api/projects/${projectId}/views?resource=${resource}`;
  const { data: views } = useSWR<View[]>(listKey, swrFetcher);

  const resolvedViewId = useMemo<string | null>(() => {
    if (form.v) return form.v;
    if (lastViewId && views && views.some((v) => v.id === lastViewId)) {
      return lastViewId;
    }
    return null;
  }, [form.v, lastViewId, views]);

  const view = useMemo<View | null>(() => {
    if (!resolvedViewId || !views) return null;
    return views.find((v) => v.id === resolvedViewId) ?? null;
  }, [resolvedViewId, views]);

  const baseline = useMemo<ViewParams>(
    () => (view ? readParamsFromView(view.config as Record<string, unknown>) : EMPTY_VIEW_PARAMS),
    [view]
  );

  const effective = useMemo<ViewParams>(
    () => computeEffective(form, baseline, hasMadeEdit),
    [form, baseline, hasMadeEdit]
  );
  const isFormDirty = !paramsEqual(effective, baseline);

  const isLoading = views === undefined && (form.v !== null || hadLastViewIdAtMount);

  // Functional update so back-to-back setters compose before nuqs commits.
  const writePartial = useCallback(
    (patch: Partial<ViewParams>) => {
      setHasMadeEdit(true);
      void setForm((prev) => {
        const prevRaw: RawFormState = {
          v: prev.v,
          filter: prev.filter,
          search: prev.search,
          sortBy: prev.sortBy,
          sortDirection: prev.sortDirection,
        };
        const prevEffective = parseFormToParams(prevRaw);
        const nextEffective: ViewParams = { ...prevEffective, ...patch };
        return { ...toFormShape(nextEffective) };
      });
    },
    [setForm]
  );

  const setFilters = useCallback((filters: Filter[]) => writePartial({ filters }), [writePartial]);
  const setSearch = useCallback((search: string) => writePartial({ search }), [writePartial]);
  const setSearchAndFilters = useCallback(
    (next: { filters: Filter[]; search: string }) => writePartial(next),
    [writePartial]
  );
  const setSort = useCallback(
    (sortBy: string | null, sortDirection: "asc" | "desc" | null) => writePartial({ sortBy, sortDirection }),
    [writePartial]
  );

  const selectView = useCallback(
    (next: View | null) => {
      setHasMadeEdit(false);
      void setForm({
        v: next?.id ?? null,
        filter: null,
        search: null,
        sortBy: null,
        sortDirection: null,
      });
      setLastViewId(projectId, resource, next?.id ?? null);
    },
    [setForm, setLastViewId, projectId, resource]
  );

  const markSavedAs = useCallback(
    (viewId: string) => {
      setHasMadeEdit(false);
      void setForm({
        v: viewId,
        filter: null,
        search: null,
        sortBy: null,
        sortDirection: null,
      });
      setLastViewId(projectId, resource, viewId);
    },
    [setForm, setLastViewId, projectId, resource]
  );

  const discardForm = useCallback(() => {
    setHasMadeEdit(false);
    void setForm({
      filter: null,
      search: null,
      sortBy: null,
      sortDirection: null,
    });
  }, [setForm]);

  return useMemo(
    () => ({
      view,
      views,
      baseline,
      effective,
      isLoading,
      isFormDirty,
      setFilters,
      setSearch,
      setSearchAndFilters,
      setSort,
      selectView,
      markSavedAs,
      discardForm,
    }),
    [
      view,
      views,
      baseline,
      effective,
      isLoading,
      isFormDirty,
      setFilters,
      setSearch,
      setSearchAndFilters,
      setSort,
      selectView,
      markSavedAs,
      discardForm,
    ]
  );
}

export function viewStateToStorePatch(state: ViewStateResult) {
  return {
    view: state.view,
    views: state.views,
    viewBaseline: state.baseline,
    effective: state.effective,
    isViewLoading: state.isLoading,
    isFormDirty: state.isFormDirty,
    setFilters: state.setFilters,
    setSearch: state.setSearch,
    setSearchAndFilters: state.setSearchAndFilters,
    setSort: state.setSort,
    selectView: state.selectView,
    markSavedAs: state.markSavedAs,
    discardForm: state.discardForm,
  };
}
