"use client";

import { useState } from "react";

import Controls from "./controls";
import type { GalleryEntry } from "./registry";
import { initialSelection } from "./utils";

interface PreviewProps {
  entry: GalleryEntry;
}

export default function Preview({ entry }: PreviewProps) {
  const variants = entry.variants ?? {};
  const [selection, setSelection] = useState<Record<string, string>>(() => initialSelection(variants));

  // Fixed-sample entry: render the composition as-is, no controls.
  if (entry.sample !== undefined) {
    return (
      <div className="flex min-h-24 items-center justify-center rounded-md border border-border bg-background p-8">
        {entry.sample}
      </div>
    );
  }

  const { Component, defaultProps, sampleChildren } = entry;

  return (
    <div className="flex flex-col gap-4">
      <Controls
        variants={variants}
        selection={selection}
        onChange={(key, value) => setSelection((prev) => ({ ...prev, [key]: value }))}
      />
      <div className="flex min-h-24 items-center justify-center rounded-md border border-border bg-background p-8">
        {Component && (
          <Component {...defaultProps} {...selection}>
            {sampleChildren}
          </Component>
        )}
      </div>
    </div>
  );
}
