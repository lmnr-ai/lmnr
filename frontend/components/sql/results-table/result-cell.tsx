import { CopyButton } from "@/components/ui/copy-button";

export const ResultCell = ({ raw }: { raw: string }) => (
  <div className="group/cell flex items-center w-full min-w-0 gap-1">
    <span className="truncate flex-1 min-w-0">{raw}</span>
    <CopyButton
      className="h-5 w-5 shrink-0 opacity-0 group-hover/cell:opacity-100 focus-visible:opacity-100"
      iconClassName="h-3 w-3"
      size="icon"
      variant="ghost"
      text={raw}
    />
  </div>
);
