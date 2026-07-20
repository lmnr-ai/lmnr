"use client";

import { useState } from "react";

import Grid from "./grid";
import Preview from "./preview";
import { registry } from "./registry";

export default function UiGallery() {
  const [selectedName, setSelectedName] = useState<string>(registry[0]?.name ?? "");
  const entry = registry.find((e) => e.name === selectedName) ?? registry[0];

  return (
    <div className="flex h-screen w-full bg-background text-foreground">
      <aside className="flex w-56 shrink-0 flex-col gap-1 border-r border-border p-3">
        <h1 className="mb-2 px-2 text-sm font-semibold">UI Gallery</h1>
        {registry.map((e) => (
          <button
            key={e.name}
            onClick={() => setSelectedName(e.name)}
            className={`rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
              e.name === entry?.name
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted/50"
            }`}
          >
            {e.name}
          </button>
        ))}
      </aside>

      <main className="flex-1 overflow-y-auto p-6">
        {entry ? (
          <div className="flex flex-col gap-8">
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">{entry.name}</h2>
              {/* key forces control state to reset when switching components */}
              <Preview key={entry.name} entry={entry} />
            </section>
            <section>
              <Grid entry={entry} />
            </section>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No components registered.</p>
        )}
      </main>
    </div>
  );
}
