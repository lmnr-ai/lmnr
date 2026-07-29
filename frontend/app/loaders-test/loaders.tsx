// Showcase loaders for /loaders-test. Pure-CSS, theme-token colored.
// Custom keyframes (the `lt-*` classes) are defined in the <style> block in page.tsx.

// ── Spinners ────────────────────────────────────────────────────────────────

export function RingSpinner() {
  return <div className="size-8 rounded-full border-2 border-muted border-t-primary animate-spin" />;
}

export function DualRing() {
  return (
    <div className="relative size-8">
      <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary border-l-primary animate-spin" />
      <div className="absolute inset-1 rounded-full border-2 border-transparent border-b-muted-foreground border-r-muted-foreground lt-spin-reverse" />
    </div>
  );
}

export function DashedRing() {
  return <div className="size-8 rounded-full border-2 border-dashed border-primary animate-spin" />;
}

export function ConicSpinner() {
  return (
    <div
      className="size-8 rounded-full animate-spin text-primary"
      style={{
        background: "conic-gradient(from 0deg, transparent 0%, currentColor 100%)",
        WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))",
        mask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))",
      }}
    />
  );
}

export function GradientArc() {
  return (
    <div className="relative size-8 animate-spin">
      <div
        className="absolute inset-0 rounded-full text-primary"
        style={{
          background: "conic-gradient(from 90deg, transparent 0deg, currentColor 300deg, transparent 360deg)",
          WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 0)",
          mask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 0)",
        }}
      />
    </div>
  );
}

// ── Dots ──────────────────────────────────────────────────────────────────--

export function BouncingDots() {
  return (
    <div className="flex items-end gap-1.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-2 rounded-full bg-primary animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

export function PulseDots() {
  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-2.5 rounded-full bg-primary lt-dot-pulse"
          style={{ animationDelay: `${i * 0.18}s` }}
        />
      ))}
    </div>
  );
}

export function FadeDots() {
  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-2.5 rounded-full bg-foreground lt-fade"
          style={{ animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </div>
  );
}

export function OrbitDots() {
  return (
    <div className="relative size-8 animate-spin">
      <span className="absolute left-1/2 top-0 -translate-x-1/2 size-2 rounded-full bg-primary" />
      <span className="absolute left-1/2 bottom-0 -translate-x-1/2 size-2 rounded-full bg-muted-foreground" />
    </div>
  );
}

export function TypingDots() {
  return (
    <div className="flex items-center gap-1 rounded-full bg-muted px-3 py-2">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 rounded-full bg-muted-foreground lt-dot-pulse"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

// ── Bars ────────────────────────────────────────────────────────────────────

export function EqualizerBars() {
  return (
    <div className="flex h-8 items-center gap-1">
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="w-1 rounded-full bg-primary lt-bar-scale"
          style={{ height: "100%", animationDelay: `${i * 0.12}s` }}
        />
      ))}
    </div>
  );
}

export function WaveBars() {
  return (
    <div className="flex items-center gap-1">
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="h-4 w-1 rounded-full bg-foreground lt-wave"
          style={{ animationDelay: `${i * 0.1}s` }}
        />
      ))}
    </div>
  );
}

export function IndeterminateBar() {
  return (
    <div className="relative h-1.5 w-24 overflow-hidden rounded-full bg-muted">
      <div className="absolute inset-y-0 w-1/2 rounded-full bg-primary lt-indeterminate" />
    </div>
  );
}

// ── Pulse / ripple ────────────────────────────────────────────────────────--

export function Ripple() {
  return (
    <div className="relative size-8">
      <span className="absolute inset-0 rounded-full border-2 border-primary lt-ripple" />
      <span className="absolute inset-0 rounded-full border-2 border-primary lt-ripple" style={{ animationDelay: "0.6s" }} />
    </div>
  );
}

export function PingCircle() {
  return (
    <div className="relative flex size-8 items-center justify-center">
      <span className="absolute inline-flex size-full rounded-full bg-primary opacity-60 animate-ping" />
      <span className="relative inline-flex size-3 rounded-full bg-primary" />
    </div>
  );
}

export function BreathingCircle() {
  return <div className="size-6 rounded-full bg-primary animate-pulse" />;
}

export function RadarSweep() {
  return (
    <div
      className="size-8 rounded-full border border-muted animate-spin text-primary"
      style={{ background: "conic-gradient(from 0deg, currentColor 0deg, transparent 90deg, transparent 360deg)" }}
    />
  );
}

// ── Geometric ─────────────────────────────────────────────────────────────--

export function SpinningSquare() {
  return <div className="size-6 rounded-sm bg-primary animate-spin" />;
}

export function FlippingSquare() {
  return <div className="size-6 rounded-sm bg-primary lt-flip" />;
}

export function RotatingDiamond() {
  return (
    <div className="flex size-8 items-center justify-center">
      <div className="size-5 border-2 border-primary animate-spin" style={{ borderRadius: "2px" }} />
    </div>
  );
}

export function GridFade() {
  return (
    <div className="grid grid-cols-3 gap-1">
      {Array.from({ length: 9 }).map((_, i) => (
        <span
          key={i}
          className="size-2 rounded-[2px] bg-primary lt-fade"
          style={{ animationDelay: `${(i % 3) * 0.1 + Math.floor(i / 3) * 0.1}s` }}
        />
      ))}
    </div>
  );
}

// ── Skeleton / shimmer ──────────────────────────────────────────────────────

export function ShimmerCard() {
  return (
    <div className="relative h-12 w-28 overflow-hidden rounded-md bg-muted">
      <div
        className="absolute inset-0 lt-shimmer"
        style={{ background: "linear-gradient(90deg, transparent, color-mix(in oklch, currentColor 14%, transparent), transparent)" }}
      />
    </div>
  );
}

export function SkeletonLines() {
  return (
    <div className="flex w-28 flex-col gap-2">
      <div className="h-2 w-full rounded bg-muted animate-pulse" />
      <div className="h-2 w-3/4 rounded bg-muted animate-pulse" style={{ animationDelay: "0.15s" }} />
      <div className="h-2 w-1/2 rounded bg-muted animate-pulse" style={{ animationDelay: "0.3s" }} />
    </div>
  );
}

// ── With label (inline-usage feel) ────────────────────────────────────────--

export function SpinnerWithText() {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <div className="size-4 rounded-full border-2 border-muted border-t-primary animate-spin" />
      Loading…
    </div>
  );
}
