"use client";

import { useCallback, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { useStore } from "zustand";
import { shallow } from "zustand/shallow";

import { useToast } from "@/lib/hooks/use-toast";

import { useTableConfigStore, useTableView } from "../model/table-config-store";
import { normalizeViewConfig } from "./normalize";
import { type View } from "./types";
import ViewNameDialog from "./view-name-dialog";
import ViewsPicker from "./views-picker";

interface ViewsToolbarProps {
  projectId: string;
  resource: string;
}

export default function ViewsToolbar({ projectId, resource }: ViewsToolbarProps) {
  const { toast } = useToast();
  const { mutate } = useSWRConfig();

  const configStore = useTableConfigStore();
  const { columnDirty, markColumnsSaved, discardColumns } = useStore(
    configStore,
    (s) => ({
      columnDirty: s.isDirty(),
      markColumnsSaved: s.markColumnsSaved,
      discardColumns: s.discard,
    }),
    shallow
  );

  const { view, effective, isFormDirty, selectView: selectViewUrl, markSavedAs, discardForm } = useTableView();
  const viewId = view?.id ?? null;

  const dirty = columnDirty || isFormDirty;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // Newer save aborts the in-flight one — last-write-wins on baseline.
  const saveAbortRef = useRef<AbortController | null>(null);

  const listKey = `/api/projects/${projectId}/views?resource=${resource}`;

  const handleSelect = useCallback((next: View | null) => selectViewUrl(next), [selectViewUrl]);

  const handleSavePatch = useCallback(async () => {
    if (viewId === null) return;

    saveAbortRef.current?.abort();
    const controller = new AbortController();
    saveAbortRef.current = controller;

    const normalized = normalizeViewConfig(configStore.getState().config, effective);
    setIsSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/views/${viewId}`, {
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
      const savedView = (await res.json()) as View;
      // SWR cache must update before markSavedAs clears the URL params,
      // otherwise effective collapses to the stale baseline for one frame.
      await mutate(
        listKey,
        (cached: View[] | undefined) => (cached ?? []).map((v) => (v.id === savedView.id ? savedView : v)),
        { revalidate: false }
      );
      markColumnsSaved();
      markSavedAs(viewId);
      void mutate(listKey);
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
  }, [viewId, projectId, configStore, toast, mutate, listKey, markColumnsSaved, markSavedAs, effective]);

  const handleSaveAsNew = useCallback(
    async (name: string): Promise<{ ok: true } | { ok: false; message?: string }> => {
      const config = normalizeViewConfig(configStore.getState().config, effective);
      try {
        const res = await fetch(`/api/projects/${projectId}/views`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resource, name, config }),
        });
        if (!res.ok) {
          const errMessage = await res
            .json()
            .then((d) => d?.error)
            .catch(() => null);
          return { ok: false, message: errMessage ?? "Failed to save view" };
        }
        const created = (await res.json()) as View;
        // Same ordering invariant as handleSavePatch.
        await mutate(listKey, (cached: View[] | undefined) => [...(cached ?? []), created], { revalidate: false });
        markColumnsSaved();
        markSavedAs(created.id);
        void mutate(listKey);
        return { ok: true };
      } catch (e) {
        return {
          ok: false,
          message: e instanceof Error ? e.message : "Failed to save view",
        };
      }
    },
    [projectId, resource, configStore, mutate, listKey, effective, markColumnsSaved, markSavedAs]
  );

  const handleDiscard = useCallback(() => {
    discardColumns();
    discardForm();
  }, [discardColumns, discardForm]);

  return (
    <>
      <ViewsPicker
        projectId={projectId}
        resource={resource}
        currentViewId={viewId}
        dirty={dirty}
        isSaving={isSaving}
        onSelect={handleSelect}
        onSaveCurrent={handleSavePatch}
        onSaveAsNew={() => setDialogOpen(true)}
        onDiscard={handleDiscard}
      />
      <ViewNameDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Save view"
        description="Share these table settings with the project as a named view."
        onSave={handleSaveAsNew}
      />
    </>
  );
}
