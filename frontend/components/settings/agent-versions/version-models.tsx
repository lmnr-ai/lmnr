import { Cpu } from "lucide-react";

import { Badge } from "@/components/ui/badge";

const MAX_VISIBLE = 3;

export default function VersionModels({ models }: { models: string[] }) {
  if (models.length === 0) {
    return <span className="text-xs text-muted-foreground">No model reported</span>;
  }

  const hidden = models.length - MAX_VISIBLE;

  return (
    <div className="flex flex-wrap items-center gap-1" title={models.join(", ")}>
      <Cpu className="size-3.5 text-muted-foreground" />
      {models.slice(0, MAX_VISIBLE).map((model) => (
        <Badge key={model} variant="outline" className="h-5 font-mono font-normal text-muted-foreground">
          {model}
        </Badge>
      ))}
      {hidden > 0 && <span className="text-xs text-muted-foreground">+{hidden}</span>}
    </div>
  );
}
