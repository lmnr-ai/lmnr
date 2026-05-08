"use client";

import { type KeyboardEvent } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { useToast } from "@/lib/hooks/use-toast";

import { useQueueStore } from "./queue-store";

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
  const isApproved = useQueueStore((s) => s.getCurrentItem()?.isLabelled ?? false);

  // The Data and Target panels render through CodeMirror, whose editable layer
  // is `contentEditable` — NOT a form tag. `enableOnFormTags` alone leaves
  // those panels deaf to ⌘⏎/⌘⌫/⌘←/⌘→, so we also opt into contenteditable.
  // Mirrors the playground / SQL editor pages.
  const hotkeyOptions = { enableOnFormTags: true, enableOnContentEditable: true } as const;

  // ⌘+Enter toggles: not-approved → approve, approved → unapprove. Same shortcut
  // works in both directions so a mistaken approval is one keystroke away from
  // being undone.
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
    hotkeyOptions
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
    hotkeyOptions
  );

  useHotkeys(
    "meta+left,ctrl+left",
    (e: KeyboardEvent) => {
      e.preventDefault();
      step(-1);
    },
    hotkeyOptions
  );

  useHotkeys(
    "meta+right,ctrl+right",
    (e: KeyboardEvent) => {
      e.preventDefault();
      step(1);
    },
    hotkeyOptions
  );

  return null;
}
