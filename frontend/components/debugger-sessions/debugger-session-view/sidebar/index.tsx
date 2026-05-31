"use client";

import React from "react";

import RunRail from "./run-rail";
import SessionInfo from "./session-info";

export default function DebuggerSidebar() {
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <SessionInfo />
      <RunRail />
    </div>
  );
}
