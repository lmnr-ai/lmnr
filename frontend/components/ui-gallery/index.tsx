"use client";

import { useState } from "react";

import Assorted from "./assorted";
import Grid from "./grid";
import Preview from "./preview";
import { notPreviewable, registry } from "./registry";

const ASSORTED = "Assorted";

export default function UiGallery() {
  const [selectedName, setSelectedName] = useState<string>(ASSORTED);
  const isAssorted = selectedName === ASSORTED;
  const entry = registry.find((e) => e.name === selectedName);

  return (
    <div className="flex h-screen w-full bg-background text-foreground">
      <aside className="flex w-56 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border p-3">
        <h1 className="mb-2 px-2 text-sm font-semibold">UI Gallery</h1>

        <button
          onClick={() => setSelectedName(ASSORTED)}
          className={`rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
            isAssorted ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/50"
          }`}
        >
          Assorted
        </button>

        <div className="mt-4 px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
          Components
        </div>
        {registry.map((e) => (
          <button
            key={e.name}
            onClick={() => setSelectedName(e.name)}
            className={`rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
              e.name === selectedName
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted/50"
            }`}
          >
            {e.name}
          </button>
        ))}

        <div className="mt-4 px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
          Needs app context
        </div>
        {notPreviewable.map((n) => (
          <div key={n.name} className="px-2 py-1 text-xs text-muted-foreground/50" title={n.reason}>
            {n.name}
          </div>
        ))}
      </aside>

      <main className="flex-1 overflow-y-auto p-6">
        {isAssorted ? (
          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Assorted</h2>
            <p className="text-sm text-muted-foreground">
              A composed slice of the app — the design system at a glance, built from the same primitives the product
              uses.
            </p>
            <Assorted />
          </div>
        ) : entry ? (
          <div className="flex flex-col gap-8">
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">{entry.name}</h2>
              {/* key forces control state to reset when switching components */}
              <Preview key={entry.name} entry={entry} />
            </section>
            {entry.variants && (
              <section>
                <Grid entry={entry} />
              </section>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No components registered.</p>
        )}
      </main>
    </div>
  );
}
