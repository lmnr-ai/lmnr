"use client";

import "dialkit/styles.css";
import { DialRoot } from "dialkit";
import { useQueryState } from "nuqs";
import { useEffect, useState } from "react";

import { ChatSessionView } from "@/components/sandbox/chat-session-view";
import { SessionView } from "@/components/traces/session-view";
import Header from "@/components/ui/header";

import { createSandboxFetch } from "./fetch-shim";
import SessionPickerDial, { type SandboxViewMode } from "./session-picker-dial";
import { type SandboxSessionFixture } from "./types";

/**
 * Renders the real SessionView against captured fixtures (see ./fixtures). The
 * fetch shim is installed before SessionView mounts so its first requests hit it.
 * Sandbox controls live in a DialKit panel.
 */
export default function SessionViewSandbox() {
  const [fixtures, setFixtures] = useState<SandboxSessionFixture[]>();
  const [sessionParam, setSessionParam] = useQueryState("session");
  const [view, setView] = useState<SandboxViewMode>("chat");

  useEffect(() => {
    const realFetch = window.fetch;
    let cancelled = false;
    import("./fixtures/sessions.json").then((mod) => {
      if (cancelled) return;
      const loaded = mod.default as unknown as SandboxSessionFixture[];
      window.fetch = createSandboxFetch(loaded, realFetch.bind(window));
      setFixtures(loaded);
    });
    return () => {
      cancelled = true;
      window.fetch = realFetch;
    };
  }, []);

  const sessionId = sessionParam ?? fixtures?.[0]?.sessionId;

  return (
    <>
      <Header path={[{ name: "sandbox" }, { name: "session view" }]} childrenContainerClassName="flex-none mr-2 h-12" />
      <div className="flex-none border-t" />
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {fixtures && sessionId ? (
          view === "chat" ? (
            <ChatSessionView key={sessionId} sessionId={sessionId} />
          ) : (
            <SessionView key={sessionId} sessionId={sessionId} />
          )
        ) : null}
      </div>
      {fixtures && sessionId && (
        <SessionPickerDial
          fixtures={fixtures}
          sessionId={sessionId}
          onSessionChange={setSessionParam}
          onViewChange={setView}
        />
      )}
      <DialRoot position="top-right" />
    </>
  );
}
