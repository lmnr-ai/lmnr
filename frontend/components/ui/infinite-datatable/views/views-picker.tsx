"use client";

import { Check, ChevronDown, FilePlus2, Layers2, Loader2, Pencil, Save, Search, Trash2, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/lib/hooks/use-toast";
import { cn, swrFetcher } from "@/lib/utils";

import { useLastViewStore } from "./last-view-store";
import { type View } from "./types";
import ViewNameDialog from "./view-name-dialog";

interface ViewsPickerProps {
  projectId: string;
  resource: string;
  currentViewId: string | null;
  dirty?: boolean;
  isSaving?: boolean;
  onSelect: (view: View | null) => void;
  onSaveCurrent?: () => void;
  onSaveAsNew?: () => void;
  onDiscard?: () => void;
}

const SECTION_LABEL_CLASS = "px-2 py-1 text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground";

// Hide the search affordance entirely until the user has enough views to
// benefit from filtering — keeps the menu compact for the common case.
const SEARCH_THRESHOLD = 4;
const DEFAULT_LABEL = "Default view";

export default function ViewsPicker({
  projectId,
  resource,
  currentViewId,
  dirty = false,
  isSaving = false,
  onSelect,
  onSaveCurrent,
  onSaveAsNew,
  onDiscard,
}: ViewsPickerProps) {
  const { toast } = useToast();
  const { mutate } = useSWRConfig();

  const listKey = `/api/projects/${projectId}/views?resource=${resource}`;
  const { data: views, isLoading, isValidating } = useSWR<View[]>(listKey, swrFetcher);

  const setLastViewId = useLastViewStore((s) => s.setLastViewId);

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  // Only one manage-view action can be open at a time, so one slot covers both.
  const [pending, setPending] = useState<{ view: View; action: "delete" | "rename" } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const showSearch = (views?.length ?? 0) >= SEARCH_THRESHOLD;

  // Hand focus to the search input on open. Radix's MenuContent doesn't expose
  // `onOpenAutoFocus` on its public type even though MenuContentImpl supports
  // it at runtime — using setTimeout(0) lands after Radix's synchronous
  // first-menuitem focus so we can override it without a type cast.
  useEffect(() => {
    if (!open || !showSearch) return;
    const id = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [open, showSearch]);
  const q = search.trim().toLowerCase();

  const filteredViews = useMemo(() => {
    if (!views) return [];
    if (!q) return views;
    return views.filter((v) => v.name.toLowerCase().includes(q));
  }, [views, q]);

  const showDefault = !q || DEFAULT_LABEL.toLowerCase().includes(q);
  const noMatches = q.length > 0 && filteredViews.length === 0 && !showDefault;

  const handlePick = useCallback(
    (view: View) => {
      onSelect(view);
      setLastViewId(projectId, resource, view.id);
    },
    [onSelect, setLastViewId, projectId, resource]
  );

  const handleReset = useCallback(() => {
    onSelect(null);
    setLastViewId(projectId, resource, null);
  }, [onSelect, setLastViewId, projectId, resource]);

  const handleManage = useCallback((view: View, action: "delete" | "rename", e: React.MouseEvent) => {
    // Stop bubbling and default so the parent `DropdownMenuItem` doesn't fire
    // `onSelect`, and close the dropdown so the dialog owns the focus trap.
    e.stopPropagation();
    e.preventDefault();
    setOpen(false);
    setPending({ view, action });
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (pending?.action !== "delete") return;
    const view = pending.view;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/views/${view.id}`, { method: "DELETE" });
      if (!res.ok) {
        const errMessage = await res
          .json()
          .then((d) => d?.error)
          .catch(() => null);
        toast({ variant: "destructive", title: errMessage ?? "Failed to delete view" });
        return;
      }
      await mutate(listKey);
      if (currentViewId === view.id) {
        onSelect(null);
        setLastViewId(projectId, resource, null);
      }
      setPending(null);
    } catch {
      toast({ variant: "destructive", title: "Failed to delete view" });
    } finally {
      setIsDeleting(false);
    }
  }, [pending, projectId, listKey, mutate, currentViewId, onSelect, setLastViewId, resource, toast]);

  const handleRename = useCallback(
    async (name: string): Promise<{ ok: true } | { ok: false; message?: string }> => {
      if (pending?.action !== "rename") return { ok: false, message: "No view selected" };
      try {
        const res = await fetch(`/api/projects/${projectId}/views/${pending.view.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (!res.ok) {
          const errMessage = await res
            .json()
            .then((d) => d?.error)
            .catch(() => null);
          return { ok: false, message: errMessage ?? "Failed to rename view" };
        }
        const updated = (await res.json()) as View;
        // Optimistic cache patch so the dropdown reflects the new name before SWR revalidates.
        await mutate(
          listKey,
          (cached: View[] | undefined) => (cached ?? []).map((v) => (v.id === updated.id ? updated : v)),
          { revalidate: false }
        );
        void mutate(listKey);
        setPending(null);
        return { ok: true };
      } catch (e) {
        return {
          ok: false,
          message: e instanceof Error ? e.message : "Failed to rename view",
        };
      }
    },
    [pending, projectId, listKey, mutate]
  );

  const selected = views?.find((v) => v.id === currentViewId) ?? null;
  const triggerLabel = selected?.name ?? DEFAULT_LABEL;

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="text-secondary-foreground gap-1 outline-0" disabled={isLoading}>
            <Layers2 className="size-3.5 shrink-0 opacity-70" />
            {isLoading ? (
              <Skeleton className="h-3.5 w-12" />
            ) : (
              <span className="truncate max-w-[180px]">{triggerLabel}</span>
            )}
            {isSaving ? (
              <Loader2 aria-label="Saving" className="size-3 shrink-0 animate-spin text-amber-500" />
            ) : (
              dirty && <span aria-label="Unsaved changes" className="size-1.5 shrink-0 rounded-full bg-amber-500" />
            )}
            <ChevronDown className="size-3.5 shrink-0 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[260px] p-1">
          {showSearch && (
            <div className="px-1 pb-1">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={inputRef}
                  size="xs"
                  placeholder="Search views…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    // ArrowDown hands focus off to the first selectable item;
                    // anything else is kept inside the input so Radix's
                    // built-in typeahead doesn't intercept printable keys.
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      const menu = e.currentTarget.closest("[role='menu']");
                      const firstItem = menu?.querySelector<HTMLElement>("[role='menuitem']:not([data-disabled])");
                      firstItem?.focus();
                    } else if (e.key !== "Escape" && e.key !== "Tab") {
                      e.stopPropagation();
                    }
                  }}
                  className="h-7 pl-7 text-xs"
                />
              </div>
            </div>
          )}

          {dirty && (
            <>
              <DropdownMenuLabel className={SECTION_LABEL_CLASS}>Unsaved changes</DropdownMenuLabel>
              {currentViewId !== null && onSaveCurrent && (
                <DropdownMenuItem onSelect={onSaveCurrent} disabled={isSaving} className="text-xs">
                  <Save className="size-3.5" />
                  <span className="flex-1 truncate">Save changes</span>
                </DropdownMenuItem>
              )}
              {onSaveAsNew && (
                <DropdownMenuItem onSelect={onSaveAsNew} disabled={isSaving} className="text-xs">
                  <FilePlus2 className="size-3.5" />
                  <span className="flex-1 truncate">Save as new view</span>
                </DropdownMenuItem>
              )}
              {onDiscard && (
                <DropdownMenuItem variant="destructive" onSelect={onDiscard} disabled={isSaving} className="text-xs">
                  <Undo2 className="size-3.5" />
                  <span className="flex-1 truncate">Discard changes</span>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
            </>
          )}

          <DropdownMenuLabel className={SECTION_LABEL_CLASS}>Views</DropdownMenuLabel>
          {showDefault && (
            <DropdownMenuItem onSelect={handleReset} className="text-xs">
              <span className="flex-1 truncate">{DEFAULT_LABEL}</span>
              {currentViewId === null && <Check className="size-3.5 shrink-0" />}
            </DropdownMenuItem>
          )}
          {filteredViews.map((view) => {
            const active = currentViewId === view.id;
            return (
              <DropdownMenuItem key={view.id} onSelect={() => handlePick(view)} className="group text-xs">
                <span className="flex-1 truncate">{view.name}</span>
                {/* Trailing slot: check (idle) swaps for rename + delete buttons on hover.
                  Buttons are absolute so the row width never shifts. */}
                <span className="relative inline-flex h-5 w-11 shrink-0 items-center justify-end">
                  {active && (
                    <Check className="absolute inset-y-0 right-0 my-auto size-3.5 transition-opacity group-hover:opacity-0 group-focus-within:opacity-0" />
                  )}
                  <button
                    type="button"
                    aria-label={`Rename ${view.name}`}
                    onClick={(e) => handleManage(view, "rename", e)}
                    className={cn(
                      "absolute right-6 inline-flex size-5 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity",
                      "group-hover:opacity-100 focus-visible:opacity-100"
                    )}
                  >
                    <Pencil className="size-3.5 shrink-0" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${view.name}`}
                    onClick={(e) => handleManage(view, "delete", e)}
                    className={cn(
                      "absolute right-0 inline-flex size-5 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity",
                      "group-hover:opacity-100 focus-visible:opacity-100"
                    )}
                  >
                    <Trash2 className="size-3.5 shrink-0" />
                  </button>
                </span>
              </DropdownMenuItem>
            );
          })}
          {noMatches && <div className="px-2 py-3 text-center text-xs text-muted-foreground">No matches.</div>}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog
        open={pending?.action === "delete"}
        onOpenChange={(next) => {
          if (!next && !isDeleting) setPending(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete view</DialogTitle>
            <DialogDescription>
              {pending?.action === "delete"
                ? `Are you sure you want to delete "${pending.view.name}"? This cannot be undone.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={isDeleting}>
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ViewNameDialog
        open={pending?.action === "rename"}
        onOpenChange={(next) => {
          if (!next) setPending(null);
        }}
        title="Rename view"
        initialName={pending?.action === "rename" ? pending.view.name : ""}
        submitLabel="Rename"
        onSave={handleRename}
      />
    </>
  );
}
