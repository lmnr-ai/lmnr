"use client";

import { useDialKit } from "dialkit";
import { useEffect, useRef } from "react";

import { LIVE_SESSIONS } from "./live-sessions";
import { type SandboxSessionFixture } from "./types";

export type SandboxViewMode = "chat" | "classic";

interface SessionPickerDialProps {
  fixtures: SandboxSessionFixture[];
  sessionId: string;
  onSessionChange: (sessionId: string) => void;
  onViewChange: (view: SandboxViewMode) => void;
}

// Mounted only after fixtures load: the DialKit config (its select options) is fixed at mount.
export default function SessionPickerDial({
  fixtures,
  sessionId,
  onSessionChange,
  onViewChange,
}: SessionPickerDialProps) {
  const values = useDialKit(
    "Sandbox",
    {
      view: {
        type: "select",
        options: [
          { value: "chat", label: "Chat (v0)" },
          { value: "classic", label: "Classic" },
        ],
        default: "chat",
      },
      session: {
        type: "select",
        options: [
          ...LIVE_SESSIONS.map((s) => ({ value: s.sessionId, label: `${s.label} · local DB` })),
          ...fixtures.map((f) => ({ value: f.sessionId, label: `${f.label} · ${f.traces.length} traces` })),
        ],
        default: sessionId,
      },
    },
    { id: "sandbox" }
  );

  useEffect(() => onViewChange(values.view as SandboxViewMode), [values.view, onViewChange]);

  // React only to dial edits, so URL-driven changes (back/forward) aren't overwritten.
  const prev = useRef(values.session);
  useEffect(() => {
    if (values.session === prev.current) return;
    prev.current = values.session;
    if (values.session) onSessionChange(values.session);
  }, [values.session, onSessionChange]);

  return null;
}
