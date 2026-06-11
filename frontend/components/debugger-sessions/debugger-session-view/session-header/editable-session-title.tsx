"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";

const PLACEHOLDER = "Set session name";

interface EditableSessionTitleProps {
  /** The session's real name, or null when never named (→ show the placeholder). */
  name: string | null;
  sessionId: string;
  /** Update the store on a successful rename (drives the title + breadcrumb live). */
  onRenamed: (name: string) => void;
}

/**
 * Ghost-input session title (Google-Drive / Figma style): it looks exactly like
 * the static title until you click it, then an outline appears — the text itself
 * never changes size, weight, color, or position. An empty name shows a
 * "Set session name" placeholder. Saves on Enter/blur, reverts on Escape.
 *
 * The field hugs its text via a hidden sizer span (so the focus outline wraps the
 * text, not the whole column). `-ml-1` + `px-1` keep the text glyphs in the exact
 * same spot whether or not the (always-present, transparent-until-focus) border
 * is visible, so clicking causes zero layout shift.
 */
export default function EditableSessionTitle({ name, sessionId, onRenamed }: EditableSessionTitleProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(name ?? "");
  const [editing, setEditing] = useState(false);

  // Adopt external (SSE / store) name changes — e.g. a CLI rename of the open
  // session — without clobbering an in-progress edit or fighting a just-blurred
  // commit. Keyed on a ref of the last-seen name so a mere focus/blur toggle never
  // resets the field; only a genuine change to `name` does.
  const lastSyncedName = useRef(name);
  useEffect(() => {
    if (name !== lastSyncedName.current) {
      lastSyncedName.current = name;
      if (!editing) setValue(name ?? "");
    }
  }, [name, editing]);

  const commit = async () => {
    setEditing(false);
    const trimmed = value.trim();
    // No-op (unchanged) or an attempt to clear the name → just restore the field.
    if (trimmed === (name ?? "") || trimmed.length === 0) {
      setValue(name ?? "");
      return;
    }
    // Persist first; update the store (title + breadcrumb) only on success so a
    // failed rename cleanly reverts — important when the prior name was null and
    // there's no string to optimistically roll back to.
    try {
      const res = await fetch(`/api/projects/${projectId}/debugger-sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Failed to rename session");
      }
      onRenamed(trimmed);
    } catch (e) {
      setValue(name ?? "");
      toast({
        variant: "destructive",
        title: "Could not rename session",
        description: e instanceof Error ? e.message : "Please try again.",
      });
    }
  };

  return (
    <div className="-ml-1 grid max-w-full grid-cols-1 items-center">
      {/* Hidden sizer: dictates the field's width from the text/placeholder so the
          focus outline hugs the text. Mirrors the input's box (padding + border). */}
      <span
        aria-hidden
        className="invisible col-start-1 row-start-1 whitespace-pre rounded border border-transparent px-1 text-2xl font-medium"
      >
        {value || PLACEHOLDER}
      </span>
      <input
        ref={inputRef}
        value={value}
        placeholder={PLACEHOLDER}
        aria-label="Session name"
        spellCheck={false}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => setEditing(true)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            inputRef.current?.blur();
          } else if (e.key === "Escape") {
            setValue(name ?? "");
            setEditing(false);
            inputRef.current?.blur();
          }
        }}
        className={cn(
          "col-start-1 row-start-1 w-full min-w-0 rounded border border-transparent bg-transparent px-1",
          "text-2xl font-medium text-foreground outline-none transition-colors",
          "placeholder:text-muted-foreground focus:border-input"
        )}
      />
    </div>
  );
}
