"use client";

import { type ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ElevatedSurface } from "@/components/ui/surface";

import { ElevationBadge } from "./elevation-badge";
import { Overlays } from "./overlays";
import { ScaleSwatches } from "./scale-swatches";
import { StackControls } from "./stack-controls";
import { SurfaceSwatches } from "./surface-swatches";
import { SwatchOverlays } from "./swatch-overlays";

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function Snippet({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-md border bg-surface-down px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground/80">
      <code>{children}</code>
    </pre>
  );
}

export default function ElevationDemo() {
  return (
    <div className="h-full overflow-y-auto bg-background text-foreground">
      <div className="mx-auto max-w-4xl space-y-14 px-6 py-12">
        <header className="space-y-3">
          <h1 className="text-2xl font-semibold tracking-tight">Elevation</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            The surface elevation system. A level flows down through React context (surviving portals); higher elevation
            paints a lighter surface. Everything below is live — open the overlays and watch the badges.
          </p>
          <ElevationBadge label="this page sits at elevation" />
        </header>

        <Section
          title="Two tools you reach for"
          description="Own the DOM node? Use ElevatedSurface — it paints the fill, publishes the neighbour vars, and provides the level in one atomic step. A library owns the node (a Radix content element)? Use the useElevation() hook for the paint classes, and re-provide the level with the low-level ElevationProvider."
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">&lt;ElevatedSurface&gt;</CardTitle>
                <CardDescription>
                  Paints + publishes vars + provides context. The default for DOM you own.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Snippet>{`<ElevatedSurface offset={1}>\n  {children}\n</ElevatedSurface>`}</Snippet>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">useElevation()</CardTitle>
                <CardDescription>Read the level anywhere; get paint classes for a node a library owns.</CardDescription>
              </CardHeader>
              <CardContent>
                <Snippet>{`const { elevation, className } =\n  useElevation({ offset: 2 });`}</Snippet>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">ElevationProvider</CardTitle>
                <CardDescription>
                  Low-level escape hatch — re-provide a level onto a painted foreign node&apos;s children.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Snippet>{`<ElevationProvider value={elevation}>\n  {children}\n</ElevationProvider>`}</Snippet>
              </CardContent>
            </Card>
          </div>
        </Section>

        <Section
          title="Surfaces stack"
          description="Each ElevatedSurface climbs one step off its parent and lightens (levels 2 → 5). Every level carries the same control strip — badge, a hover/active button, a popover and a tooltip. Note the `border` on each nested panel also lightens: border is now a dynamic surface-bound color (elevation + 300), so it tracks depth automatically."
        >
          <ElevatedSurface className="space-y-4 rounded-xl border p-5">
            <StackControls />
            <ElevatedSurface className="space-y-4 rounded-lg border p-5">
              <StackControls />
              <ElevatedSurface className="space-y-4 rounded-lg border p-5">
                <StackControls />
                <ElevatedSurface className="space-y-3 rounded-md border p-4">
                  <StackControls />
                </ElevatedSurface>
              </ElevatedSurface>
            </ElevatedSurface>
          </ElevatedSurface>
        </Section>

        <Section
          title="Relative bump utilities"
          description="Every painted surface republishes its neighbours as bg-surface-up / -down (and bg-surface for its own fill). Reference them without knowing your absolute level — ideal for hovers and insets."
        >
          <ElevatedSurface offset={3} className="space-y-5 rounded-xl border p-5">
            <div className="flex items-center justify-between">
              <ElevationBadge />
              <span className="font-mono text-[11px] text-muted-foreground">relative to here</span>
            </div>
            <SurfaceSwatches />
            <div className="divide-y divide-border overflow-hidden rounded-md border">
              {["Traces", "Spans", "Sessions"].map((row) => (
                <button
                  key={row}
                  className="flex w-full items-center justify-between px-3 py-2 text-sm transition-colors hover:bg-surface-up"
                >
                  <span>{row}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">hover:bg-surface-up</span>
                </button>
              ))}
            </div>
          </ElevatedSurface>
        </Section>

        <Section
          title="Full surface scale"
          description="Every step of the raw ramp (surface-00 → 800) with its OKLCH lightness (L) and the step delta (Δ) from the previous level. Tagged where the background / secondary / muted semantic tokens land."
        >
          <ScaleSwatches />
        </Section>

        <Section
          title="Verify the vars inside overlays"
          description="The bump swatches rendered inside a popover and a tooltip. Both are surfaces two levels above their trigger, so the swatches step from the overlay's own level — each is labeled so you can confirm bg-surface-up / -down resolve against the overlay, not the page."
        >
          <SwatchOverlays />
        </Section>

        <Section
          title="Overlays are surfaces too"
          description="Dialogs, sheets, popovers, menus and tooltips read the elevation where they're triggered — context survives the portal — then open a couple of steps above it. Same components, two different origins:"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-4 rounded-xl border p-5">
              <ElevationBadge label="triggered from elevation" />
              <p className="text-sm text-muted-foreground">On the base plane.</p>
              <Overlays />
            </div>
            <ElevatedSurface offset={3} className="space-y-4 rounded-xl border p-5">
              <ElevationBadge label="triggered from elevation" />
              <p className="text-sm text-muted-foreground">Deep inside a stack.</p>
              <Overlays />
            </ElevatedSurface>
          </div>
        </Section>
      </div>
    </div>
  );
}
