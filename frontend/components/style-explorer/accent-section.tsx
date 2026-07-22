"use client";

// TEMPORARY style exploration tooling — safe to delete this folder + the mount in layout.tsx.
// OKLCH accent-family editor (#9): the hue/lightness curve canvas + a shared chroma slider and a
// per-hue row (hue readout, chroma nudge, gamut-clip flag). Writes the raw --red..--pink tokens.

import { Slider } from "@/components/ui/slider";

import AccentCurveEditor from "./accent-curve-editor";
import { useStyleContext } from "./style-context";
import { catmullRom, oklchInGamut, oklchToSrgb } from "./tokens";

export default function AccentSection() {
  const { state, setAccentChroma, setAccentColor } = useStyleContext();
  const { chroma, curve, colors } = state.accent;
  const curvePts = curve.map((p) => ({ x: p.hue, y: p.l }));

  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs font-medium text-foreground">Accent family (OKLCH)</div>
      <div className="text-[11px] text-muted-foreground">
        Drag the square anchors to shape the lightness curve (double-click empty space to add a point,
        double-click a point to remove it); drag a round color dot left/right to set its hue. Each color
        is sampled where its line crosses the curve — a flat curve = equal perceived brightness. The red
        band is out of sRGB gamut at the current chroma.
      </div>
      <AccentCurveEditor />

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Shared chroma</span>
          <span className="tabular-nums">{chroma.toFixed(3)}</span>
        </div>
        <Slider value={[chroma]} min={0} max={0.37} step={0.005} onValueChange={(v) => setAccentChroma(v[0])} />
      </div>

      <div className="flex flex-col gap-1.5">
        {colors.map((c) => {
          const l = catmullRom(curvePts, c.hue);
          const cc = Math.max(0, chroma + c.nudge);
          const [r, g, b] = oklchToSrgb(l, cc, c.hue);
          const clipped = !oklchInGamut(l, cc, c.hue);
          return (
            <div key={c.key} className="flex items-center gap-2">
              <div className="size-4 shrink-0 rounded border border-border" style={{ backgroundColor: `rgb(${r} ${g} ${b})` }} />
              <span className="w-12 shrink-0 font-mono text-[11px] text-foreground">{c.key.replace(/^--/, "")}</span>
              <span className="w-10 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
                {Math.round(c.hue)}°
              </span>
              <Slider
                className="flex-1"
                value={[c.nudge]}
                min={-0.12}
                max={0.12}
                step={0.005}
                onValueChange={(v) => setAccentColor(c.key, { nudge: v[0] })}
              />
              <span className="w-4 shrink-0 text-center text-[11px]" title={clipped ? "out of gamut — clamped" : "in gamut"}>
                {clipped ? "⚠" : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
