"use client";

import { useCallback, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { useStore } from "zustand";
import { shallow } from "zustand/shallow";

import { Button } from "@/components/ui/button";
import { useToast } from "@/lib/hooks/use-toast";

import { useTableConfigStore } from "../model/table-config-store";
import { useLastViewStore } from "./last-view-store";
import { normalizeViewConfig } from "./normalize";
import SaveViewDialog from "./save-view-dialog";
import { type View } from "./types";
import ViewsPicker from "./views-picker";

interface ViewsToolbarProps {
  projectId: string;
  resourceType: string;
}

export default function ViewsToolbar({ projectId, resourceType }: ViewsToolbarProps) {
  const { toast } = useToast();
  const { mutate } = useSWRConfig();
  const setLastViewId = useLastViewStore((s) => s.setLastViewId);

  const store = useTableConfigStore();
  const { currentViewId, dirty, selectView, markSavedAs, discard } = useStore(
    store,
    (s) => ({
      currentViewId: s.currentViewId,
      dirty: s.isDirty(),
      selectView: s.selectView,
      markSavedAs: s.markSavedAs,
      discard: s.discard,
    }),
    shallow
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // Aborts any in-flight Save when a newer one fires — last-write-wins so a
  // stale response can't overwrite a fresher click's baseline.
  const saveAbortRef = useRef<AbortController | null>(null);

  const listKey = `/api/projects/${projectId}/views?resourceType=${resourceType}`;

  const handleAutoSelect = useCallback((view: View) => selectView(view.id, view.config ?? {}), [selectView]);

  const handleSelect = useCallback(
    (view: View | null) => {
      if (view) {
        selectView(view.id, view.config ?? {});
      } else {
        selectView(null, {});
      }
    },
    [selectView]
  );

  const handleSavePatch = useCallback(async () => {
    if (currentViewId === null) return;

    saveAbortRef.current?.abort();
    const controller = new AbortController();
    saveAbortRef.current = controller;

    const normalized = normalizeViewConfig(store.getState().config);
    setIsSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/views/${currentViewId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: normalized }),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (!res.ok) {
        const errMessage = await res
          .json()
          .then((d) => d?.error)
          .catch(() => null);
        toast({ variant: "destructive", title: errMessage ?? "Failed to save view" });
        return;
      }
      // markSavedAs promotes baseline = current config. Subtle gotcha: if the
      // user edited DURING the request, that newer state becomes the baseline
      // and dirty silently flattens. Acceptable for now — toolbar disables
      // Save while in-flight, so the user has to be racing keystrokes.
      markSavedAs(currentViewId);
      await mutate(listKey);
    } catch (e) {
      if (controller.signal.aborted) return;
      toast({
        variant: "destructive",
        title: e instanceof Error ? e.message : "Failed to save view",
      });
    } finally {
      if (saveAbortRef.current === controller) {
        saveAbortRef.current = null;
        setIsSaving(false);
      }
    }
  }, [currentViewId, projectId, store, toast, mutate, listKey, markSavedAs]);

  const handleSaveAsNew = useCallback(
    async (name: string): Promise<{ ok: true } | { ok: false; conflict: boolean; message?: string }> => {
      const config = normalizeViewConfig(store.getState().config);
      try {
        const res = await fetch(`/api/projects/${projectId}/views`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resourceType, name, config }),
        });
        if (!res.ok) {
          const errMessage = await res
            .json()
            .then((d) => d?.error)
            .catch(() => null);
          if (res.status === 409) {
            return { ok: false, conflict: true };
          }
          return { ok: false, conflict: false, message: errMessage ?? "Failed to save view" };
        }
        const created = (await res.json()) as View;
        markSavedAs(created.id);
        setLastViewId(projectId, resourceType, created.id);
        await mutate(listKey);
        return { ok: true };
      } catch (e) {
        return {
          ok: false,
          conflict: false,
          message: e instanceof Error ? e.message : "Failed to save view",
        };
      }
    },
    [projectId, resourceType, store, markSavedAs, setLastViewId, mutate, listKey]
  );

  return (
    <>
      <div className="flex items-center gap-2">
        <ViewsPicker
          projectId={projectId}
          resourceType={resourceType}
          onAutoSelect={handleAutoSelect}
          onSelect={handleSelect}
        />
        {dirty && (
          <>
            <Button size="sm" variant="ghost" onClick={discard} disabled={isSaving}>
              Discard
            </Button>
            {currentViewId !== null ? (
              <>
                <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)} disabled={isSaving}>
                  Save as new
                </Button>
                <Button size="sm" onClick={handleSavePatch} disabled={isSaving}>
                  {isSaving ? "Saving…" : "Save"}
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={() => setDialogOpen(true)} disabled={isSaving}>
                Save view
              </Button>
            )}
          </>
        )}
      </div>
      <SaveViewDialog open={dialogOpen} onOpenChange={setDialogOpen} onSave={handleSaveAsNew} />
    </>
  );
}
