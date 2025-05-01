import { PropsWithChildren } from "react";

import { CopyButton } from "@/components/ui/copy-button";
import Mono from "@/components/ui/mono";

interface MonoWithCopyProps {
  className?: string;
}

export default function MonoWithCopy({ children, className }: PropsWithChildren<MonoWithCopyProps>) {
  return (
    <div className="flex items-center group">
      <Mono className={className}>{children}</Mono>
      <CopyButton
        iconClassName="w-3.5 h-3.5"
        size="icon"
        variant="ghost"
        className="invisible group-hover:visible"
        text={children as string}
      />
    </div>
  );
}
