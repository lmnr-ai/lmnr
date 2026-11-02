import { Badge } from "@/components/ui/badge";

export default function VersionModels({ models }: { models: string[] }) {
  if (models.length === 0) {
    return <span className="text-xs text-muted-foreground">No model reported</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {models.map((model) => (
        <Badge key={model} variant="outline" className="h-5 font-mono font-normal text-muted-foreground">
          {model}
        </Badge>
      ))}
    </div>
  );
}
