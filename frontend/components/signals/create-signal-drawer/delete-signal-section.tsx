"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSWRConfig } from "swr";

import { isSignalsListKey } from "@/components/signals/create-signal-sheet/store";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { fetchApi } from "@/lib/api/fetch-api";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";

interface Props {
  projectId: string;
  signalId: string;
  signalName: string;
}

/** GitHub-style danger zone at the bottom of a signal's General settings. */
export default function DeleteSignalSection({ projectId, signalId, signalName }: Props) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { toast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const onDelete = async () => {
    const { error } = await fetchApi(`/api/projects/${projectId}/signals/${signalId}`, { method: "DELETE" });
    if (error) {
      toast({ variant: "destructive", title: "Couldn't delete the signal", description: error });
      return;
    }
    track("signals", "deleted");
    await mutate(isSignalsListKey(projectId));
    toast({ title: `Deleted ${signalName}` });
    // /signals opens the next signal in the sidenav, or the empty state.
    router.push(`/project/${projectId}/signals`);
  };

  return (
    <div className="flex flex-col gap-4 border-t border-border-300 pt-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">Delete this signal</span>
          <span className="text-xs text-muted-foreground">
            Removes the signal with its events, clusters and alerts. This can&apos;t be undone.
          </span>
        </div>
        <Button variant="destructiveOutline" onClick={() => setConfirmOpen(true)}>
          Delete signal
        </Button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete ${signalName}?`}
        description="The signal, its events, clusters and alerts are removed for everyone. This can't be undone."
        confirmText="Delete signal"
        onConfirm={() => void onDelete()}
      />
    </div>
  );
}
