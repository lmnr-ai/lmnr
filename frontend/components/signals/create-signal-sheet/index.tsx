"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback } from "react";
import { useSWRConfig } from "swr";

import CreateSignalDrawer, { type ManageSignalForm } from "@/components/signals/create-signal-drawer";
import { isSignalsListKey, useCreateSignalSheet } from "@/components/signals/create-signal-sheet/store";

/** Mounted once in the project layout; opens over whatever page the user is on. */
export default function CreateSignalSheet() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { open, setOpen } = useCreateSignalSheet();

  const onSuccess = useCallback(
    async (signal: ManageSignalForm) => {
      await mutate(isSignalsListKey(projectId));
      if (signal.id) router.push(`/project/${projectId}/signals/${signal.id}`);
    },
    [mutate, projectId, router]
  );

  return <CreateSignalDrawer open={open} setOpen={setOpen} onSuccess={onSuccess} />;
}
