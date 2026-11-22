import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function ExpiresCell({ expiresAt }: { expiresAt: string | null }) {
  if (!expiresAt) return "Never";

  const date = new Date(expiresAt);
  const dateLabel = date.toLocaleDateString();

  if (date >= new Date()) return dateLabel;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className="rounded-full font-medium border-destructive-border/30 bg-destructive/8 text-destructive-text"
        >
          Expired
        </Badge>
      </TooltipTrigger>
      <TooltipContent>Expired on {dateLabel}</TooltipContent>
    </Tooltip>
  );
}
