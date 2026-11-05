import { type PropsWithChildren } from "react";

import { cn } from "@/lib/utils";

import { type MessageRow, type NewInputStyle } from "./build-rows";

interface NewInputFrameProps {
  style: Exclude<NewInputStyle, "divider">;
  position: NonNullable<MessageRow["newInput"]>;
}

/**
 * One virtual row's slice of the frame around this call's new input. Each row draws its own segment (top on the
 * first, bottom on the last), so the frame reads as one block while rows stay independently virtualized.
 */
const NewInputFrame = ({
  style,
  position: { first, last, label },
  children,
}: PropsWithChildren<NewInputFrameProps>) => (
  <div className={cn(last && "pb-4")}>
    <div
      className={cn(
        style === "rail"
          ? "border-l-2 border-primary/60 pl-3"
          : cn(
              "border-x border-primary/40 bg-primary/5 px-2",
              first && "border-t rounded-t-lg pt-2",
              last && "border-b rounded-b-lg pb-2"
            ),
        !last && "pb-4"
      )}
    >
      {first && (
        <div className="flex items-center gap-1.5 pb-2 text-xs">
          <span className="font-medium text-primary">{label.title}</span>
          {label.detail && <span className="text-muted-foreground">· {label.detail}</span>}
        </div>
      )}
      {children}
    </div>
  </div>
);

export default NewInputFrame;
