import { EllipsisVertical, Unplug } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function CardMenu({ onDisconnect }: { onDisconnect: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label="GitHub options" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
          <EllipsisVertical size={14} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem variant="destructive" onClick={onDisconnect}>
          <Unplug className="h-3.5 w-3.5" />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
