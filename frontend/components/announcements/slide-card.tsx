import { X } from "lucide-react";
import { type ReactNode } from "react";

export interface CarouselSlide {
  id: string;
  title: string;
  description: string;
  /** Full-width button pinned to the bottom of the card; omitted when there's nothing to do. */
  action?: ReactNode;
  onDismiss: () => void;
  /** Card height in px. Fixed (not measured) so the carousel can transition between slides. */
  height?: number;
}

export const DEFAULT_SLIDE_HEIGHT = 157;

/** Shared look for the bottom-of-card button (GitHub stars, Learn more, CTA). */
export const CARD_BUTTON_CLASS =
  "flex h-[30px] w-full items-center justify-center gap-2 rounded-[4px] bg-surface-500 px-2 text-xs text-secondary-foreground no-underline transition-colors hover:overlay-hover hover:text-foreground";

export default function SlideCard({
  title,
  description,
  action,
  onDismiss,
  height = DEFAULT_SLIDE_HEIGHT,
}: Omit<CarouselSlide, "id">) {
  return (
    <div
      className="flex w-full flex-col justify-between overflow-hidden rounded-[8px] bg-surface-400"
      style={{ height }}
    >
      <div className="flex w-full flex-col gap-2 px-3 pb-[6px] pt-[10px] text-xs">
        <div className="flex w-full items-start justify-between gap-2">
          <p className="min-w-0 break-words text-foreground">{title}</p>
          <button
            type="button"
            aria-label="Dismiss"
            title="Dismiss"
            onClick={onDismiss}
            className="flex size-[15px] shrink-0 items-center justify-center text-secondary-foreground hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        </div>
        <p className="line-clamp-4 break-words text-secondary-foreground">{description}</p>
      </div>
      {action && <div className="w-full p-2">{action}</div>}
    </div>
  );
}
