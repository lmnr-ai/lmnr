import { type Metadata } from "next";

import DebuggerSessions from "@/components/debugger-sessions/debugger-sessions";

export const metadata: Metadata = {
  title: "Debugger",
};

export default async function DebuggerSessionsPage() {
  return <DebuggerSessions />;
}
