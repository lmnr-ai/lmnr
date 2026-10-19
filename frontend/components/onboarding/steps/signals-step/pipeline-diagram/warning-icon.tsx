import { type CSSProperties } from "react";

import { cn } from "@/lib/utils";

interface WarningIconProps {
  className?: string;
  style?: CSSProperties;
  // Fill of the "!" — set to the surface behind the icon so it reads as a cut-out.
  markClassName?: string;
}

export default function WarningIcon({ className, style, markClassName }: WarningIconProps) {
  return (
    <svg viewBox="0 0 14 13" className={cn("w-3.5 h-[13px] shrink-0", className)} style={style} aria-hidden>
      <path
        className="fill-current"
        d="M5.15 0.57C4.77 0.84 4.43 1.19 4.18 1.62L0.47 8.04C0.17 8.55 0 9.13 0 9.73C0 11.53 1.46 13 3.26 13H10.74C12.54 13 14 11.53 14 9.73C14 9.15 13.85 8.59 13.57 8.11L9.82 1.62C9.57 1.19 9.23 0.84 8.84 0.57C7.73 -0.19 6.27 -0.19 5.15 0.57Z"
      />
      <path
        className={cn("fill-surface-350", markClassName)}
        d="M6.32 8.3L6.04 4.22V2.39H7.97V4.22L7.69 8.3H6.32ZM6.82 11.35C6.54 11.35 6.32 11.27 6.15 11.12C5.99 10.96 5.91 10.75 5.91 10.5C5.91 10.24 5.99 10.03 6.15 9.88C6.32 9.72 6.54 9.64 6.82 9.64H7.19C7.46 9.64 7.68 9.72 7.84 9.88C8.01 10.03 8.1 10.24 8.1 10.5C8.1 10.76 8.01 10.96 7.84 11.12C7.68 11.27 7.46 11.35 7.17 11.35H6.82Z"
      />
    </svg>
  );
}
