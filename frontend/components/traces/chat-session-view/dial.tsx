"use client";

import "dialkit/styles.css";
import { DialRoot, useDialKit } from "dialkit";
import { useEffect } from "react";

import { type StatsPosition, useChatViewStore } from "./store";

/** DialKit panel for prototyping the chat session view's layout. */
export default function ChatSessionDial() {
  const setStatsPosition = useChatViewStore((s) => s.setStatsPosition);
  const values = useDialKit(
    "Session view",
    {
      statsPosition: {
        type: "select",
        options: [
          { value: "middle", label: "In work row" },
          { value: "below", label: "Under reply" },
        ],
        default: "below",
      },
    },
    { id: "chat-session-view" }
  );

  useEffect(() => setStatsPosition(values.statsPosition as StatsPosition), [values.statsPosition, setStatsPosition]);

  return <DialRoot position="top-right" />;
}
