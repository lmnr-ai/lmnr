import { type PropsWithChildren } from "react";

interface CliLoginPanelProps {
  title: string;
}

export function CliLoginPanel({ title, children }: PropsWithChildren<CliLoginPanelProps>) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-card-foreground shadow-sm">
        <h1 className="text-xl font-semibold">{title}</h1>
        <div className="mt-4 flex flex-col gap-4">{children}</div>
      </div>
    </div>
  );
}
