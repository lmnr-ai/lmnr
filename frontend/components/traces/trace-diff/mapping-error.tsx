import { RotateCw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

const MappingError = ({ error, onRetry }: { error: string; onRetry: () => void }) => (
  <div className="flex-none flex items-center justify-center gap-2 py-2 bg-destructive/10 border-b border-destructive/20">
    <TriangleAlert className="size-3.5 text-destructive" />
    <span className="text-sm text-destructive">{error}</span>
    <Button variant="outline" size="sm" className="h-6 text-xs ml-1" onClick={onRetry}>
      <RotateCw className="size-3" />
      Retry
    </Button>
  </div>
);

export default MappingError;
