"use client";

import { useState } from "react";

import Controls from "./controls";
import type { GalleryEntry } from "./registry";
import { initialSelection } from "./utils";

interface PreviewProps {
  entry: GalleryEntry;
}

export default function Preview({ entry }: PreviewProps) {
  const [selection, setSelection] = useState<Record<string, string>>(() => initialSelection(entry.variants));
  const { Component, defaultProps, sampleChildren } = entry;

  return (
    <div className="flex flex-col gap-4">
      <Controls
        variants={entry.variants}
        selection={selection}
        onChange={(key, value) => setSelection((prev) => ({ ...prev, [key]: value }))}
      />
      <div className="flex min-h-24 items-center justify-center rounded-md border border-border bg-background p-8">
        <Component {...defaultProps} {...selection}>
          {sampleChildren}
        </Component>
      </div>
    </div>
  );
}
