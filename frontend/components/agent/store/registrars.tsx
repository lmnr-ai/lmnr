"use client";

// Filler registrants. The real Laminar Agent context registry lives in lmnr-private; these stubs
// exist only so the OSS shared surfaces (project layout, trace view) compile against the same
// import surface. They register nothing and render nothing.

export function RouteAgentContext() {
  return null;
}

export function TraceAgentContext(_props: { traceId: string }) {
  return null;
}
