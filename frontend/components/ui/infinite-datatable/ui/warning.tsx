import { TriangleAlert } from "lucide-react";
import Link from "next/link";

import { useProjectContext } from "@/contexts/project-context";
import { cn } from "@/lib/utils.ts";

interface RetentionWarningProps {
  warning?: string;
  className?: string;
}

export function Warning({ warning, className }: RetentionWarningProps) {
  const { workspace } = useProjectContext();

  if (!warning) return null;

  return (
    <>
      <div className={cn(`flex items-center gap-2 text-xs px-2 py-1.5 bg-yellow-500/15 text-yellow-500/90`, className)}>
        <TriangleAlert className="size-4 shrink-0 text-warning" />
        <span>
          {warning}
          {workspace && (
            <>
              {" "}
              To see more,{" "}
              <Link
                href={`/workspace/${workspace.id}?tab=billing`}
                className="underline font-medium hover:text-warning"
              >
                upgrade your plan
              </Link>
              .
            </>
          )}
        </span>
      </div>
    </>
  );
}
