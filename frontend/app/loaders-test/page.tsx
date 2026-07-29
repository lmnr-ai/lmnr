import type { ReactNode } from "react";

import * as L from "./loaders";

// Throwaway showcase to browse loader options. Route: /loaders-test
// Not linked from anywhere; delete once we pick a direction.

type Group = {
  title: string;
  note?: string;
  /** "block" cells stretch to the cell width and size to content — for skeleton layouts. */
  layout?: "tile" | "block";
  items: { label: string; Comp: () => ReactNode }[];
};

const GROUPS: Group[] = [
  {
    title: "Spinners",
    items: [
      { label: "RingSpinner", Comp: L.RingSpinner },
      { label: "DualRing", Comp: L.DualRing },
      { label: "DashedRing", Comp: L.DashedRing },
      { label: "ConicSpinner", Comp: L.ConicSpinner },
      { label: "GradientArc", Comp: L.GradientArc },
      { label: "Pinwheel", Comp: L.Pinwheel },
      { label: "OrbitComet", Comp: L.OrbitComet },
      { label: "TwoToneRing", Comp: L.TwoToneRing },
      { label: "SegmentSpinner", Comp: L.SegmentSpinner },
      { label: "PieSweep", Comp: L.PieSweep },
    ],
  },
  {
    title: "Logo",
    note: "Our mark, animated — self-drawing outline, sheen sweep, fill wipe, and a logo-shaped spinner.",
    items: [
      { label: "LogoComet", Comp: L.LogoComet },
      { label: "LogoTrace", Comp: L.LogoTrace },
      { label: "LogoDrawFill", Comp: L.LogoDrawFill },
      { label: "LogoConicSpin", Comp: L.LogoConicSpin },
      { label: "LogoShimmer", Comp: L.LogoShimmer },
      { label: "LogoFillWipe", Comp: L.LogoFillWipe },
      { label: "LogoPulse", Comp: L.LogoPulse },
    ],
  },
  {
    title: "Pixel",
    note: "Retro / 8-bit: sharp squares and stepped timing.",
    items: [
      { label: "PixelInvader", Comp: L.PixelInvader },
      { label: "PixelSpinner", Comp: L.PixelSpinner },
      { label: "PixelBar", Comp: L.PixelBar },
      { label: "PixelGridSnake", Comp: L.PixelGridSnake },
      { label: "PixelWave", Comp: L.PixelWave },
      { label: "PixelHeart", Comp: L.PixelHeart },
      { label: "PixelDither", Comp: L.PixelDither },
    ],
  },
  {
    title: "SpinKit",
    note: "Reproductions of the classic SpinKit set (tobiasahlin.com/spinkit).",
    items: [
      { label: "RotatingPlane", Comp: L.RotatingPlane },
      { label: "DoubleBounce", Comp: L.DoubleBounce },
      { label: "ThreeBounce", Comp: L.ThreeBounce },
      { label: "ChasingDots", Comp: L.ChasingDots },
      { label: "WanderingCubes", Comp: L.WanderingCubes },
      { label: "FoldingCube", Comp: L.FoldingCube },
      { label: "CubeGrid", Comp: L.CubeGrid },
      { label: "CircleFade", Comp: L.CircleFade },
      { label: "FadingCircle", Comp: L.FadingCircle },
      { label: "SkWave", Comp: L.SkWave },
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
      { label: "ShadowDots", Comp: L.ShadowDots },
      { label: "DotStream", Comp: L.DotStream },
      { label: "NewtonsCradle", Comp: L.NewtonsCradle },
    ],
  },
  {
    title: "Bars",
    items: [
      { label: "EqualizerBars", Comp: L.EqualizerBars },
      { label: "WaveBars", Comp: L.WaveBars },
      { label: "SoundWave", Comp: L.SoundWave },
      { label: "FillingBars", Comp: L.FillingBars },
      { label: "PingPongBar", Comp: L.PingPongBar },
    ],
  },
  {
    title: "Progress",
    note: "Indeterminate progress indicators, including the MUI linear/circular math.",
    items: [
      { label: "IndeterminateBar", Comp: L.IndeterminateBar },
      { label: "CircularRing", Comp: L.CircularRing },
      { label: "QueryBar", Comp: L.QueryBar },
      { label: "SegmentedSteps", Comp: L.SegmentedSteps },
      { label: "StripedBar", Comp: L.StripedBar },
      { label: "BufferBar", Comp: L.BufferBar },
      { label: "StepDots", Comp: L.StepDots },
    ],
  },
  {
    title: "Pulse & ripple",
    items: [
      { label: "Ripple", Comp: L.Ripple },
      { label: "PingCircle", Comp: L.PingCircle },
      { label: "BreathingCircle", Comp: L.BreathingCircle },
      { label: "RadarSweep", Comp: L.RadarSweep },
      { label: "PulseRings", Comp: L.PulseRings },
    ],
  },
  {
    title: "Geometric",
    items: [
      { label: "SpinningSquare", Comp: L.SpinningSquare },
      { label: "FlippingSquare", Comp: L.FlippingSquare },
      { label: "RotatingDiamond", Comp: L.RotatingDiamond },
      { label: "GridFade", Comp: L.GridFade },
      { label: "MorphSquare", Comp: L.MorphSquare },
    ],
  },
  {
    title: "Skeletons",
    note: "Content-shaped placeholders. Pulse variants breathe opacity; wave variants slide a sheen across the surface.",
    layout: "block",
    // Ordered roughly by height so the 3-column grid stays visually even.
    items: [
      { label: "SkeletonTextLines", Comp: L.SkeletonTextLines },
      { label: "SkeletonTextWave", Comp: L.SkeletonTextWave },
      { label: "SkeletonListItem", Comp: L.SkeletonListItem },
      { label: "SkeletonButtons", Comp: L.SkeletonButtons },
      { label: "SkeletonChips", Comp: L.SkeletonChips },
      { label: "SkeletonStatTiles", Comp: L.SkeletonStatTiles },
      { label: "SkeletonParagraphBlock", Comp: L.SkeletonParagraphBlock },
      { label: "SkeletonSidebarNav", Comp: L.SkeletonSidebarNav },
      { label: "SkeletonCodeBlock", Comp: L.SkeletonCodeBlock },
      { label: "SkeletonListWave", Comp: L.SkeletonListWave },
      { label: "SkeletonMediaObject", Comp: L.SkeletonMediaObject },
      { label: "SkeletonComment", Comp: L.SkeletonComment },
      { label: "SkeletonProfileHeader", Comp: L.SkeletonProfileHeader },
      { label: "SkeletonTable", Comp: L.SkeletonTable },
      { label: "SkeletonChart", Comp: L.SkeletonChart },
      { label: "SkeletonCard", Comp: L.SkeletonCard },
      { label: "SkeletonGallery", Comp: L.SkeletonGallery },
      { label: "SkeletonForm", Comp: L.SkeletonForm },
      { label: "SkeletonFeedPost", Comp: L.SkeletonFeedPost },
    ],
  },
  {
    title: "Inline",
    items: [
      { label: "SpinnerWithText", Comp: L.SpinnerWithText },
      { label: "ButtonLoading", Comp: L.ButtonLoading },
      { label: "InlineDots", Comp: L.InlineDots },
      { label: "ShimmerText", Comp: L.ShimmerText },
    ],
  },
];

const TOTAL = GROUPS.reduce((n, g) => n + g.items.length, 0);

const KEYFRAMES = `
  @keyframes lt-spin-reverse { to { transform: rotate(-360deg); } }
  .lt-spin-reverse { animation: lt-spin-reverse 0.8s linear infinite; }

  @keyframes lt-dot-pulse { 0%,100% { transform: scale(0.5); opacity: 0.4; } 50% { transform: scale(1); opacity: 1; } }
  .lt-dot-pulse { animation: lt-dot-pulse 1s ease-in-out infinite; }

  @keyframes lt-fade { 0%,100% { opacity: 0.2; } 50% { opacity: 1; } }
  .lt-fade { animation: lt-fade 1.2s ease-in-out infinite; }

  /* SpinKit fading-circle: hard cut on rather than a smooth breathe. */
  @keyframes lt-fade-hard { 0%,39%,100% { opacity: 0; } 40% { opacity: 1; } }
  .lt-fade-hard { animation: lt-fade-hard 1.2s linear infinite both; }

  @keyframes lt-bar-scale { 0%,100% { transform: scaleY(0.3); } 50% { transform: scaleY(1); } }
  .lt-bar-scale { transform-origin: center; animation: lt-bar-scale 1s ease-in-out infinite; }

  @keyframes lt-wave { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
  .lt-wave { animation: lt-wave 1s ease-in-out infinite; }

  @keyframes lt-sound { 0%,100% { transform: scaleY(0.25); } 50% { transform: scaleY(1); } }
  .lt-sound { transform-origin: center; animation: lt-sound 0.9s ease-in-out infinite; }

  @keyframes lt-fill { 0%,100% { transform: scaleY(0.12); } 50% { transform: scaleY(1); } }
  .lt-fill { animation: lt-fill 1.1s ease-in-out infinite; }

  @keyframes lt-pingpong { 0%,100% { transform: translateX(0); } 50% { transform: translateX(233%); } }
  .lt-pingpong { animation: lt-pingpong 1.4s cubic-bezier(0.65, 0, 0.35, 1) infinite; }

  @keyframes lt-indeterminate { 0% { transform: translateX(-100%); } 100% { transform: translateX(200%); } }
  .lt-indeterminate { animation: lt-indeterminate 1.2s ease-in-out infinite; }

  @keyframes lt-ripple { 0% { transform: scale(0.3); opacity: 0.8; } 100% { transform: scale(1); opacity: 0; } }
  .lt-ripple { animation: lt-ripple 1.6s ease-out infinite; }

  @keyframes lt-flip { 0% { transform: perspective(120px) rotateY(0); } 50% { transform: perspective(120px) rotateY(180deg); } 100% { transform: perspective(120px) rotateY(360deg); } }
  .lt-flip { animation: lt-flip 1.2s ease-in-out infinite; }

  @keyframes lt-morph {
    0%,100% { border-radius: 14%; transform: rotate(0deg); }
    50% { border-radius: 50%; transform: rotate(180deg); }
  }
  .lt-morph { animation: lt-morph 2s ease-in-out infinite; }

  @keyframes lt-shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
  .lt-shimmer { animation: lt-shimmer 1.6s ease-in-out infinite; }

  /* Calmer than Tailwind's animate-pulse — skeletons should not strobe. */
  @keyframes lt-pulse-soft { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }
  .lt-pulse-soft { animation: lt-pulse-soft 1.7s ease-in-out infinite; }

  @keyframes lt-chart-bar { 0%,100% { transform: scaleY(0.72); opacity: 1; } 50% { transform: scaleY(1); opacity: 0.55; } }
  .lt-chart-bar { animation: lt-chart-bar 1.8s ease-in-out infinite; }

  /* ── SpinKit ── */
  @keyframes lt-rotate-plane {
    0% { transform: perspective(120px) rotateX(0deg) rotateY(0deg); }
    50% { transform: perspective(120px) rotateX(-180.1deg) rotateY(0deg); }
    100% { transform: perspective(120px) rotateX(-180deg) rotateY(-179.9deg); }
  }
  .lt-rotate-plane { animation: lt-rotate-plane 1.2s ease-in-out infinite; }

  @keyframes lt-bounce-scale { 0%,100% { transform: scale(0); } 50% { transform: scale(1); } }
  .lt-bounce-scale { animation: lt-bounce-scale 2s ease-in-out infinite; }

  @keyframes lt-three-bounce { 0%,80%,100% { transform: scale(0); } 40% { transform: scale(1); } }
  .lt-three-bounce { animation: lt-three-bounce 1.4s ease-in-out infinite both; }

  @keyframes lt-chase { 80%,100% { transform: rotate(360deg); } }
  .lt-chase { animation: lt-chase 2s linear infinite both; }
  @keyframes lt-chase-dot { 50% { transform: translateX(-50%) scale(0.4); } 0%,100% { transform: translateX(-50%) scale(1); } }
  .lt-chase-dot { animation: lt-chase-dot 2s ease-in-out infinite both; }

  @keyframes lt-wander {
    0% { transform: rotate(0deg); }
    25% { transform: translateX(20px) rotate(-90deg) scale(0.5); }
    50% { transform: translateX(20px) translateY(20px) rotate(-179deg); }
    50.1% { transform: translateX(20px) translateY(20px) rotate(-180deg); }
    75% { transform: translateX(0) translateY(20px) rotate(-270deg) scale(0.5); }
    100% { transform: rotate(-360deg); }
  }
  .lt-wander { animation: lt-wander 1.8s ease-in-out infinite; }

  @keyframes lt-fold {
    0%,10% { transform: perspective(140px) rotateX(-180deg); opacity: 0; }
    25%,75% { transform: perspective(140px) rotateX(0deg); opacity: 1; }
    90%,100% { transform: perspective(140px) rotateY(180deg); opacity: 0; }
  }
  .lt-fold { animation: lt-fold 2.4s linear infinite both; }

  @keyframes lt-cube-grid { 0%,70%,100% { transform: scale3d(1,1,1); } 35% { transform: scale3d(0,0,1); } }
  .lt-cube-grid { animation: lt-cube-grid 1.3s ease-in-out infinite; }

  @keyframes lt-sk-wave { 0%,40%,100% { transform: scaleY(0.4); } 20% { transform: scaleY(1); } }
  .lt-sk-wave { animation: lt-sk-wave 1.2s ease-in-out infinite both; }

  /* Ring dots are centered via translateX, so the scale keyframe must carry it. */
  @keyframes lt-ring-scale { 0%,80%,100% { transform: translateX(-50%) scale(0); } 40% { transform: translateX(-50%) scale(1); } }
  .lt-ring-scale { animation: lt-ring-scale 1.2s ease-in-out infinite both; }

  /* ── Dots ── */
  /* One element, three dots: the middle is the element itself, the outer two are
     box-shadows. An outer shadow at offset 0 would be clipped by the border box. */
  @keyframes lt-shadow-dots {
    0%,100% { background-color: var(--lt-dim); box-shadow: -13px 0 0 currentColor, 13px 0 0 var(--lt-dim); }
    33%     { background-color: currentColor;  box-shadow: -13px 0 0 var(--lt-dim), 13px 0 0 var(--lt-dim); }
    66%     { background-color: var(--lt-dim); box-shadow: -13px 0 0 var(--lt-dim), 13px 0 0 currentColor; }
  }
  .lt-shadow-dots {
    --lt-dim: color-mix(in oklch, currentColor 35%, transparent);
    animation: lt-shadow-dots 1.35s ease-in-out infinite;
  }

  @keyframes lt-dot-stream {
    0%   { transform: translateX(0) scale(0.4); opacity: 0; }
    20%  { transform: translateX(18px) scale(1); opacity: 1; }
    80%  { transform: translateX(70px) scale(1); opacity: 1; }
    100% { transform: translateX(88px) scale(0.4); opacity: 0; }
  }
  .lt-dot-stream { animation: lt-dot-stream 1.4s linear infinite; }

  @keyframes lt-cradle-l { 0%,50%,100% { transform: rotate(0deg); } 25% { transform: rotate(-42deg); } }
  .lt-cradle-l { animation: lt-cradle-l 1.4s ease-in-out infinite; }
  @keyframes lt-cradle-r { 0%,50%,100% { transform: rotate(0deg); } 75% { transform: rotate(42deg); } }
  .lt-cradle-r { animation: lt-cradle-r 1.4s ease-in-out infinite; }

  /* ── Progress ── */
  /* MUI CircularProgress stroke math. */
  @keyframes lt-dash {
    0% { stroke-dasharray: 1px, 200px; stroke-dashoffset: 0; }
    50% { stroke-dasharray: 100px, 200px; stroke-dashoffset: -15px; }
    100% { stroke-dasharray: 100px, 200px; stroke-dashoffset: -125px; }
  }
  .lt-dash { animation: lt-dash 1.4s ease-in-out infinite; }

  /* MUI LinearProgress indeterminate — two segments on offset timelines. */
  @keyframes lt-query-1 { 0% { left: -35%; right: 100%; } 60%,100% { left: 100%; right: -90%; } }
  .lt-query-1 { animation: lt-query-1 2.1s cubic-bezier(0.65, 0.815, 0.735, 0.395) infinite; }
  @keyframes lt-query-2 { 0% { left: -200%; right: 100%; } 60%,100% { left: 107%; right: -8%; } }
  .lt-query-2 { animation: lt-query-2 2.1s cubic-bezier(0.165, 0.84, 0.44, 1) 1.15s infinite; }

  @keyframes lt-seg { 0% { transform: scaleX(0); } 25%,90% { transform: scaleX(1); } 100% { transform: scaleX(0); } }
  .lt-seg { animation: lt-seg 2.4s ease-in-out infinite both; }

  /* One full period of a 45deg / 12px repeating gradient is 12*sqrt(2) horizontally. */
  @keyframes lt-stripes { to { background-position: 16.97px 0; } }
  .lt-stripes { animation: lt-stripes 0.7s linear infinite; }

  @keyframes lt-buffer-dots { to { background-position: -8px 0; } }
  .lt-buffer-dots { animation: lt-buffer-dots 0.9s linear infinite; }

  @keyframes lt-step { 0%,100% { opacity: 0.25; transform: scale(0.75); } 25%,60% { opacity: 1; transform: scale(1); } }
  .lt-step { animation: lt-step 1.6s ease-in-out infinite both; }

  /* ── Inline ── */
  @keyframes lt-text-shimmer { 0% { background-position: 120% 0; } 100% { background-position: -20% 0; } }
  .lt-text-shimmer { animation: lt-text-shimmer 2s linear infinite; }

  /* ── Logo ── */
  @keyframes lt-logo-draw { 0% { stroke-dashoffset: 100; } 55% { stroke-dashoffset: 0; } 100% { stroke-dashoffset: -100; } }
  .lt-logo-draw { animation: lt-logo-draw 2.2s ease-in-out infinite; }

  @keyframes lt-logo-fill { 0%,45% { opacity: 0; } 65%,82% { opacity: 1; } 96%,100% { opacity: 0; } }
  .lt-logo-fill { animation: lt-logo-fill 2.2s ease-in-out infinite; }

  @keyframes lt-fill-up { 0% { transform: translateY(101%); } 50% { transform: translateY(0); } 100% { transform: translateY(-101%); } }
  .lt-fill-up { animation: lt-fill-up 2.2s ease-in-out infinite; }

  @keyframes lt-logo-pulse { 0%,100% { opacity: 0.35; transform: scale(0.86); } 50% { opacity: 1; transform: scale(1); } }
  .lt-logo-pulse { transform-origin: center; animation: lt-logo-pulse 1.5s ease-in-out infinite; }

  /* ── Pixel ── */
  /* Hard 2-frame toggle — the instant cut at 50% is the whole point. */
  @keyframes lt-frame-a { 0%,49.999% { opacity: 1; } 50%,100% { opacity: 0; } }
  .lt-frame-a { animation: lt-frame-a 1s linear infinite; }
  @keyframes lt-frame-b { 0%,49.999% { opacity: 0; } 50%,100% { opacity: 1; } }
  .lt-frame-b { animation: lt-frame-b 1s linear infinite; }

  @keyframes lt-pixel-blink { 0% { opacity: 1; } 100% { opacity: 0.15; } }
  .lt-pixel-blink { animation: lt-pixel-blink 0.8s steps(4) infinite; }

  @keyframes lt-pixel-progress { 0% { clip-path: inset(0 100% 0 0); } 100% { clip-path: inset(0 0 0 0); } }
  .lt-pixel-progress { animation: lt-pixel-progress 1.6s steps(8) infinite; }

  @keyframes lt-snake { 0%,100% { opacity: 0.12; } 8% { opacity: 1; } }
  .lt-snake { animation: lt-snake 1.5s linear infinite; }

  @keyframes lt-pixel-wave { 0%,100% { transform: scaleY(0.2); } 50% { transform: scaleY(1); } }
  .lt-pixel-wave { transform-origin: center; animation: lt-pixel-wave 0.9s steps(5) infinite; }

  @keyframes lt-heartbeat { 0%,100% { transform: scale(1); } 15% { transform: scale(1.18); } 30% { transform: scale(1); } 45% { transform: scale(1.18); } 60% { transform: scale(1); } }
  .lt-heartbeat { transform-origin: center; animation: lt-heartbeat 1.3s ease-in-out infinite; }
`;

export default function LoadersTestPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />
      <div className="mx-auto max-w-6xl px-6 py-12">
        <header className="mb-10">
          <h1 className="text-2xl font-semibold">Loaders</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Scratch page for picking a loading style. {TOTAL} variants, pure CSS, colored with theme tokens so they
            follow the app theme.
          </p>
        </header>

        <div className="flex flex-col gap-12">
          {GROUPS.map((group) => (
            <section key={group.title} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {group.title}
                  <span className="ml-2 font-mono normal-case tracking-normal opacity-60">{group.items.length}</span>
                </h2>
                {group.note && <p className="max-w-2xl text-xs text-muted-foreground/70">{group.note}</p>}
              </div>

              {group.layout === "block" ? (
                <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {group.items.map(({ label, Comp }) => (
                    <div key={label} className="flex flex-col gap-4 rounded-lg border bg-card p-4">
                      <div className="flex w-full items-start">
                        <Comp />
                      </div>
                      <span className="font-mono text-[11px] text-muted-foreground">{label}</span>
                    </div>
                  ))}
                </div>
              ) : (
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
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
