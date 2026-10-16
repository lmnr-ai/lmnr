import { Info, Lightbulb, TriangleAlert } from "lucide-react";
import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

const KINDS = {
  info: { icon: Info, className: "border-blue-400/40 bg-blue-400/5 text-blue-300" },
  tip: { icon: Lightbulb, className: "border-primary/40 bg-primary/5 text-primary" },
  warning: { icon: TriangleAlert, className: "border-yellow-400/40 bg-yellow-400/5 text-yellow-300" },
} as const;

interface CalloutProps {
  kind?: keyof typeof KINDS;
  title?: string;
  children: ReactNode;
}

export default function Callout({ kind = "info", title, children }: CalloutProps) {
  const { icon: Icon, className } = KINDS[kind] ?? KINDS.info;
  return (
    <aside className={cn("not-typeset my-6 flex gap-3 rounded-lg border px-4 py-3", className)}>
      <Icon className="mt-1 size-4 shrink-0" />
      <div className="flex flex-col gap-1 text-secondary-foreground [&_p]:m-0">
        {title && <span className="font-medium text-white">{title}</span>}
        {children}
      </div>
    </aside>
  );
}
