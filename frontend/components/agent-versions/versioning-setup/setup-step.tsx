import { CircleCheck, CircleDashed } from "lucide-react";
import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

interface SetupStepProps {
  done: boolean;
  title: string;
  description: ReactNode;
}

export default function SetupStep({ done, title, description }: SetupStepProps) {
  const Icon = done ? CircleCheck : CircleDashed;
  return (
    <div className="flex items-start gap-3">
      <Icon className={cn("mt-0.5 size-4 shrink-0", done ? "text-success" : "text-muted-foreground")} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </div>
    </div>
  );
}
