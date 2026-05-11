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

  // Per-shortcut scope split:
  //
  //  - **Approve** uses a "Submit"-style scope (fires inside form tags AND
  //    inside `contentEditable` like CodeMirror) because typing JSON and
  //    hitting ⌘⏎ to commit + advance is the single most common labelling
  //    flow. ⌘⏎ has no native binding in inputs or our editors, so grabbing
  //    it doesn't step on anything.
  //
  //  - **Discard, prev, next** keep the *default* scope (no flags) — they
  //    do NOT fire when focus is in an `<input>`, `<textarea>`, `<select>`,
  //    or a `contentEditable` host. The previous catch-all `hotkeyOptions`
  //    collided with native macOS / CodeMirror behaviour: ⌘⌫ = "delete to
  //    line start" (destructive — discarded the whole queue item while the
  //    user just wanted to delete a JSON line), ⌘← / ⌘→ = "jump to line
  //    start / end". Escape unfocuses CodeMirror so the user can still use
  //    keyboard discard/nav by pressing Esc first, but inside the editor
  //    the native edit shortcuts now win.
  const submitScope = { enableOnFormTags: true, enableOnContentEditable: true } as const;

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
    submitScope
  );

  useHotkeys("meta+backspace,ctrl+backspace", async (e: KeyboardEvent) => {
    e.preventDefault();
    const result = await discardCurrent();
    if (!result.ok && result.error !== "Busy" && result.error !== "No item") {
      toast({ variant: "destructive", title: result.error });
    }
  });

  useHotkeys("meta+left,ctrl+left", (e: KeyboardEvent) => {
    e.preventDefault();
    step(-1);
  });

  useHotkeys("meta+right,ctrl+right", (e: KeyboardEvent) => {
    e.preventDefault();
    step(1);
  });

  return null;
}
