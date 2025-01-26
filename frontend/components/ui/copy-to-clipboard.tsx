import { useToast } from "@/lib/hooks/use-toast";

import { Button } from "./button";
import { cn } from "@/lib/utils";

interface CopyToClipboardButtonProps {
  text: string;
  toastPrefix?: string;
  className?: string;
  children?: React.ReactNode;
}

export default function CopyToClipboardButton({
  text,
  toastPrefix,
  className,
  children
}: CopyToClipboardButtonProps) {
  const { toast } = useToast();
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("p-0 m-0 h-4", className)}
      onClick={() => {
        navigator.clipboard.writeText(text);
        toast({
          title: toastPrefix
            ? `${toastPrefix} copied to clipboard`
            : 'Copied to clipboard',
          duration: 1000,
        });
      }}
    >
      {children}
    </Button>
  );
}
