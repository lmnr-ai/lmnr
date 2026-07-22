"use client";

import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      theme="dark"
      position="top-right"
      toastOptions={{
        style: {
          background: "var(--color-popover)",
          color: "var(--color-popover-foreground)",
          border: "1px solid var(--color-border)",
        },
      }}
    />
  );
}
