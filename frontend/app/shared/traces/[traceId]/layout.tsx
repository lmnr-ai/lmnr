import { notFound } from "next/navigation";
import { type PropsWithChildren } from "react";

import LandingHeader from "@/components/landing/header";
import { getServerSession } from "@/lib/auth-session";

import { getCachedSharedTrace, isValidTraceId } from "./shared-trace";

// notFound() lives here, outside loading.tsx's Suspense boundary, so it yields a real 404 status.
export default async function SharedTraceLayout({
  children,
  params,
}: PropsWithChildren<{ params: Promise<{ traceId: string }> }>) {
  const { traceId } = await params;
  if (!isValidTraceId(traceId)) {
    return notFound();
  }

  const [trace, session] = await Promise.all([getCachedSharedTrace(traceId), getServerSession().catch(() => null)]);

  if (!trace || trace.visibility !== "public") {
    return notFound();
  }

  return (
    // fixed: on mobile Safari the root min-h-screen column scrolls, pulling the header away from the menu overlay.
    <div className="fixed inset-0 flex flex-col overflow-hidden">
      <div className="flex-none border-b">
        <LandingHeader hasSession={session !== null} className="w-full px-4 py-4 md:px-6" />
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
