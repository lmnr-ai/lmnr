"use client";

import { useEffect } from "react";

import { useLaminarAgentStore } from "./store";

/**
 * Client component that syncs the server-determined `aiEnabled` value
 * into the Laminar Agent Zustand store so other client components
 * (e.g. SignalsPill) can check it without importing server functions.
 */
export default function AiEnabledInitializer({ aiEnabled }: { aiEnabled: boolean }) {
  const setAiEnabled = useLaminarAgentStore((s) => s.setAiEnabled);

  useEffect(() => {
    setAiEnabled(aiEnabled);
  }, [aiEnabled, setAiEnabled]);

  return null;
}
