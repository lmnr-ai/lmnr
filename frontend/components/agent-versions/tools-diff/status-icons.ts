import { type LucideIcon, SquareMinus, SquarePlus } from "lucide-react";

import { type ToolChangeStatus } from "./utils";

/** Icon per tool change; modified tools show none. Shared by the tool rows and the version summary pills. */
export const STATUS_ICONS: Record<ToolChangeStatus, { icon: LucideIcon; className: string } | null> = {
  added: { icon: SquarePlus, className: "text-success" },
  removed: { icon: SquareMinus, className: "text-destructive" },
  modified: null,
};
