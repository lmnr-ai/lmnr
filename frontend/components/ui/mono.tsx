import { cn } from "@/lib/utils";
import { ReactNode } from "react";

export default function Mono({ className, children }: { className?: string, children: ReactNode }) {
  return (
    <span className={cn("font-mono text-[12px] pt-1", className)}>{children}</span>
  );
}