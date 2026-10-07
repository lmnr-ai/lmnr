import { AlertTriangle, CircleAlert, Info } from "lucide-react";

export const SeverityIcon = ({ severity }: { severity: number }) => {
  switch (severity) {
    case 1:
      return <AlertTriangle className="size-3.5 shrink-0 text-orange-400/80" />;
    case 2:
      return <CircleAlert className="size-3.5 shrink-0 text-red-400/100" />;
    default:
      return <Info className="size-3.5 shrink-0 text-muted-foreground/60" />;
  }
};
