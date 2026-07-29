import type { ReactNode } from "react";

import * as L from "./loaders";

// Throwaway showcase to browse loader options. Route: /loaders-test
// Not linked from anywhere; delete once we pick a direction.

const GROUPS: { title: string; items: { label: string; Comp: () => ReactNode }[] }[] = [
  {
    title: "Spinners",
    items: [
      { label: "RingSpinner", Comp: L.RingSpinner },
      { label: "DualRing", Comp: L.DualRing },
      { label: "DashedRing", Comp: L.DashedRing },
      { label: "ConicSpinner", Comp: L.ConicSpinner },
      { label: "GradientArc", Comp: L.GradientArc },
    ],
  },
  {
    title: "Dots",
    items: [
      { label: "BouncingDots", Comp: L.BouncingDots },
      { label: "PulseDots", Comp: L.PulseDots },
      { label: "FadeDots", Comp: L.FadeDots },
      { label: "OrbitDots", Comp: L.OrbitDots },
      { label: "TypingDots", Comp: L.TypingDots },
    ],
  },
  {
    title: "Bars",
    items: [
      { label: "EqualizerBars", Comp: L.EqualizerBars },
      { label: "WaveBars", Comp: L.WaveBars },
      { label: "IndeterminateBar", Comp: L.IndeterminateBar },
    ],
  },
  {
    title: "Pulse & ripple",
    items: [
      { label: "Ripple", Comp: L.Ripple },
      { label: "PingCircle", Comp: L.PingCircle },
      { label: "BreathingCircle", Comp: L.BreathingCircle },
      { label: "RadarSweep", Comp: L.RadarSweep },
    ],
  },
  {
    title: "Geometric",
    items: [
      { label: "SpinningSquare", Comp: L.SpinningSquare },
      { label: "FlippingSquare", Comp: L.FlippingSquare },
      { label: "RotatingDiamond", Comp: L.RotatingDiamond },
      { label: "GridFade", Comp: L.GridFade },
    ],
  },
  {
    title: "Skeleton & inline",
    items: [
      { label: "ShimmerCard", Comp: L.ShimmerCard },
      { label: "SkeletonLines", Comp: L.SkeletonLines },
      { label: "SpinnerWithText", Comp: L.SpinnerWithText },
    ],
  },
];

const KEYFRAMES = `
  @keyframes lt-spin-reverse { to { transform: rotate(-360deg); } }
  .lt-spin-reverse { animation: lt-spin-reverse 0.8s linear infinite; }

  @keyframes lt-dot-pulse { 0%,100% { transform: scale(0.5); opacity: 0.4; } 50% { transform: scale(1); opacity: 1; } }
  .lt-dot-pulse { animation: lt-dot-pulse 1s ease-in-out infinite; }

  @keyframes lt-fade { 0%,100% { opacity: 0.2; } 50% { opacity: 1; } }
  .lt-fade { animation: lt-fade 1.2s ease-in-out infinite; }

  @keyframes lt-bar-scale { 0%,100% { transform: scaleY(0.3); } 50% { transform: scaleY(1); } }
  .lt-bar-scale { transform-origin: center; animation: lt-bar-scale 1s ease-in-out infinite; }

  @keyframes lt-wave { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
  .lt-wave { animation: lt-wave 1s ease-in-out infinite; }

  @keyframes lt-indeterminate { 0% { transform: translateX(-100%); } 100% { transform: translateX(200%); } }
  .lt-indeterminate { animation: lt-indeterminate 1.2s ease-in-out infinite; }

  @keyframes lt-ripple { 0% { transform: scale(0.3); opacity: 0.8; } 100% { transform: scale(1); opacity: 0; } }
  .lt-ripple { animation: lt-ripple 1.6s ease-out infinite; }

  @keyframes lt-flip { 0% { transform: perspective(120px) rotateY(0); } 50% { transform: perspective(120px) rotateY(180deg); } 100% { transform: perspective(120px) rotateY(360deg); } }
  .lt-flip { animation: lt-flip 1.2s ease-in-out infinite; }

  @keyframes lt-shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
  .lt-shimmer { animation: lt-shimmer 1.4s ease-in-out infinite; }
`;

export default function LoadersTestPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />
      <div className="mx-auto max-w-6xl px-6 py-12">
        <header className="mb-10">
          <h1 className="text-2xl font-semibold">Loaders</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Scratch page for picking a loading style. Colored with theme tokens, so it follows the app theme.
          </p>
        </header>

        <div className="flex flex-col gap-12">
          {GROUPS.map((group) => (
            <section key={group.title} className="flex flex-col gap-4">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{group.title}</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {group.items.map(({ label, Comp }) => (
                  <div
                    key={label}
                    className="flex flex-col items-center justify-between gap-4 rounded-lg border bg-card p-6"
                  >
                    <div className="flex h-16 w-full items-center justify-center">
                      <Comp />
                    </div>
                    <span className="font-mono text-[11px] text-muted-foreground">{label}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
