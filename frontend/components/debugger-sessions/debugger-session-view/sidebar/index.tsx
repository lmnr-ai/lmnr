"use client";

import React from "react";

import DebugCommandPanel from "./debug-command-panel";
import RunRail from "./run-rail";
import SessionInfo from "./session-info";

export default function DebuggerSidebar() {
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <SessionInfo />
      <DebugCommandPanel />
      <RunRail />
    </div>
  );
}
