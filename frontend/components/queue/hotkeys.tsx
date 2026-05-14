"use client";

import { type KeyboardEvent } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { useToast } from "@/lib/hooks/use-toast";

import { isApproved as isApprovedItem, useQueueStore } from "./queue-store";

/**
 * Mounts the global navigation/approve/discard hotkeys for the queue page.
 * Renders nothing — every shortcut delegates to a store action.
 */
export default function QueueHotkeys() {
  const { toast } = useToast();
  const approveCurrent = useQueueStore((s) => s.approveCurrent);
  const unapproveCurrent = useQueueStore((s) => s.unapproveCurrent);
  const discardCurrent = useQueueStore((s) => s.discardCurrent);
  const step = useQueueStore((s) => s.step);
  const isApproved = useQueueStore((s) => isApprovedItem(s.getCurrentItem()));
  const dialogOpen = useQueueStore((s) => s.dialogOpen);

  const submitScope = { enableOnFormTags: true, enableOnContentEditable: true, enabled: !dialogOpen } as const;

  useHotkeys(
    "meta+enter,ctrl+enter",
    async (e: KeyboardEvent) => {
      e.preventDefault();
      const result = isApproved ? await unapproveCurrent() : await approveCurrent();
      if (
        !result.ok &&
        result.error !== "Busy" &&
        result.error !== "No item" &&
        result.error !== "No item or invalid JSON" &&
        result.error !== "Item is not approved"
      ) {
        toast({ variant: "destructive", title: result.error });
      }
    },
    submitScope
  );

  useHotkeys(
    "meta+backspace,ctrl+backspace",
    async (e: KeyboardEvent) => {
      e.preventDefault();
      const result = await discardCurrent();
      if (!result.ok && result.error !== "Busy" && result.error !== "No item") {
        toast({ variant: "destructive", title: result.error });
      }
    },
    { enabled: !dialogOpen }
  );

  useHotkeys(
    "meta+left,ctrl+left",
    (e: KeyboardEvent) => {
      e.preventDefault();
      step(-1);
    },
    { enabled: !dialogOpen }
  );

  useHotkeys(
    "meta+right,ctrl+right",
    (e: KeyboardEvent) => {
      e.preventDefault();
      step(1);
    },
    { enabled: !dialogOpen }
  );

  return null;
}
