"use client";

import { AlertTriangle, ArrowRight, Info } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Renders inside the Fields tab when the row's target disagrees with the
 * schema in a way the form can't represent. Two states:
 *
 *   - Target isn't an object → destructive banner (next field edit will
 *     overwrite the primitive/array/null with a new `{}`).
 *   - Target has keys the schema doesn't declare → amber info banner
 *     (extras are preserved on save but invisible from the Fields form).
 *
 * Returns null when neither condition holds — caller can render
 * unconditionally without a wrapping `&&`.
 */
interface SchemaDriftBannerProps {
  targetIsObject: boolean;
  targetType: string;
  extras: string[];
  onViewJson: () => void;
}

const MAX_INLINE_EXTRAS = 3;

export default function SchemaDriftBanner({ targetIsObject, targetType, extras, onViewJson }: SchemaDriftBannerProps) {
  if (!targetIsObject) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 mb-3">
        <AlertTriangle className="size-4 mt-0.5 text-destructive shrink-0" />
        <div className="flex-1 text-xs min-w-0">
          <div className="text-destructive font-medium">
            Target is <code className="font-mono">{targetType}</code>, not an object
          </div>
          <div className="text-secondary-foreground mt-0.5">
            Selecting a field below will replace the existing value with a new object.
          </div>
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs shrink-0" onClick={onViewJson}>
          View JSON
          <ArrowRight className="size-3 ml-1" />
        </Button>
      </div>
    );
  }

  if (extras.length === 0) return null;

  const shown = extras.slice(0, MAX_INLINE_EXTRAS).join(", ");
  const rest = extras.length - MAX_INLINE_EXTRAS;

  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 mb-3">
      <Info className="size-4 mt-0.5 text-amber-500 shrink-0" />
      <div className="flex-1 text-xs min-w-0">
        <div className="text-amber-600 dark:text-amber-500 font-medium">
          {extras.length} {extras.length === 1 ? "key isn't" : "keys aren't"} part of the schema
        </div>
        <div className="text-secondary-foreground mt-0.5 break-words">
          <span className="font-mono">{shown}</span>
          {rest > 0 && ` +${rest} more`}
          {" — preserved on save, but not editable here."}
        </div>
      </div>
      <Button variant="ghost" size="sm" className="h-7 text-xs shrink-0" onClick={onViewJson}>
        View JSON
        <ArrowRight className="size-3 ml-1" />
      </Button>
    </div>
  );
}
