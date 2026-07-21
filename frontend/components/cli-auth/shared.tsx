"use client";

import { type ReactNode } from "react";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function Centered({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen w-full items-center justify-center bg-background p-6">{children}</div>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

// Subtle single-box code display.
export function UserCodeDisplay({ code }: { code: string }) {
  return (
    <div className="w-full select-all rounded-md border bg-muted px-4 py-2 text-center font-mono text-lg tracking-[0.2em] text-foreground">
      {code}
    </div>
  );
}

export function CompletionScreen({ result }: { result: "approved" | "denied" }) {
  return (
    <Centered>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{result === "approved" ? "Authorized" : "Denied"}</CardTitle>
          <CardDescription>
            {result === "approved"
              ? "You can close this tab and return to your terminal."
              : "Return to your terminal and re-run `lmnr-cli login` if you want to retry."}
          </CardDescription>
        </CardHeader>
      </Card>
    </Centered>
  );
}
