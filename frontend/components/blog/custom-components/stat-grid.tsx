import { type ReactNode } from "react";

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="not-typeset my-6 grid grid-cols-1 gap-3 sm:grid-cols-3">{children}</div>;
}

interface StatProps {
  value: string;
  label: string;
}

export function Stat({ value, label }: StatProps) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
      <span className="text-2xl font-semibold text-white">{value}</span>
      <span className="text-sm text-secondary-foreground">{label}</span>
    </div>
  );
}
