// Showcase loaders for /loaders-test. Pure-CSS, theme-token colored.
// Custom keyframes (the `lt-*` classes) are defined in the <style> block in page.tsx.
//
// Sources reproduced/adapted: SpinKit (tobiasahlin.com/spinkit), css-loaders.com
// single-element tricks, MUI CircularProgress/LinearProgress indeterminate math,
// MUI + Ant Design + react-loading-skeleton composite skeleton layouts.

import { cn } from "@/lib/utils";

// Translucent sheen used by every shimmer/wave surface. currentColor keeps it theme-aware.
const SHEEN = "linear-gradient(90deg, transparent, color-mix(in oklch, currentColor 14%, transparent), transparent)";

// ── Skeleton primitives ─────────────────────────────────────────────────────

type BoneProps = { className?: string; delay?: number; width?: string | number };

/** Pulsing skeleton block. */
function Bone({ className, delay = 0, width }: BoneProps) {
  return (
    <div
      className={cn("rounded bg-muted lt-pulse-soft", className)}
      style={{ animationDelay: `${delay}s`, width }}
    />
  );
}

/** Skeleton block with a shimmer wave sliding across it. */
function Wave({ className, delay = 0, width }: BoneProps) {
  return (
    <div className={cn("relative overflow-hidden rounded bg-muted", className)} style={{ width }}>
      <div className="absolute inset-0 lt-shimmer" style={{ background: SHEEN, animationDelay: `${delay}s` }} />
    </div>
  );
}

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

/** Three concentric arcs at different speeds and directions. */
export function Pinwheel() {
  return (
    <div className="relative size-8 text-primary">
      <span
        className="absolute inset-0 rounded-full border-2 border-transparent border-t-current animate-spin"
        style={{ animationDuration: "1.5s" }}
      />
      <span
        className="absolute inset-[5px] rounded-full border-2 border-transparent border-t-current lt-spin-reverse"
        style={{ animationDuration: "1.1s" }}
      />
      <span
        className="absolute inset-[10px] rounded-full border-2 border-transparent border-t-current animate-spin"
        style={{ animationDuration: "0.8s" }}
      />
    </div>
  );
}

/** Bright head dot dragging a fading tail around the ring. */
export function OrbitComet() {
  return (
    <div className="relative size-8 animate-spin text-primary" style={{ animationDuration: "1.1s" }}>
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0deg, color-mix(in oklch, currentColor 25%, transparent) 200deg, currentColor 358deg, transparent 360deg)",
          WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 0)",
          mask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 0)",
        }}
      />
      <span className="absolute left-1/2 top-0 size-[3px] -translate-x-1/2 rounded-full bg-current" />
    </div>
  );
}

/** Full ring split into two tones — reads as a dual-color arc while spinning. */
export function TwoToneRing() {
  return (
    <div className="relative size-8 animate-spin">
      <span className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-primary border-r-primary" />
      <span className="absolute inset-0 rounded-full border-[3px] border-transparent border-b-muted-foreground border-l-muted-foreground" />
    </div>
  );
}

/** 12 ticks around a dial, fading in sequence (macOS/iOS activity indicator). */
export function SegmentSpinner() {
  return (
    <div className="relative size-8">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="absolute inset-0" style={{ transform: `rotate(${i * 30}deg)` }}>
          <span
            className="absolute left-1/2 top-0 h-[7px] w-[2px] -translate-x-1/2 rounded-full bg-primary lt-fade"
            style={{ animationDelay: `${-1.1 + i * 0.1}s`, animationDuration: "1.2s" }}
          />
        </div>
      ))}
    </div>
  );
}

/** Solid pie with a wedge cut out. */
export function PieSweep() {
  return (
    <div
      className="size-7 rounded-full animate-spin text-primary"
      style={{ background: "conic-gradient(currentColor 0deg 300deg, transparent 300deg)" }}
    />
  );
}

// ── SpinKit ─────────────────────────────────────────────────────────────────

export function RotatingPlane() {
  return <div className="size-6 bg-primary lt-rotate-plane" />;
}

export function DoubleBounce() {
  return (
    <div className="relative size-8">
      <span className="absolute inset-0 rounded-full bg-primary opacity-60 lt-bounce-scale" />
      <span className="absolute inset-0 rounded-full bg-primary opacity-60 lt-bounce-scale" style={{ animationDelay: "-1s" }} />
    </div>
  );
}

export function ThreeBounce() {
  return (
    <div className="flex items-center gap-1.5">
      {[-0.32, -0.16, 0].map((d) => (
        <span key={d} className="size-2.5 rounded-full bg-primary lt-three-bounce" style={{ animationDelay: `${d}s` }} />
      ))}
    </div>
  );
}

export function ChasingDots() {
  return (
    <div className="relative size-8 animate-spin" style={{ animationDuration: "2.5s" }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="absolute inset-0 lt-chase" style={{ animationDelay: `${-1.1 + i * 0.1}s` }}>
          <span
            className="absolute left-1/2 top-0 size-[24%] -translate-x-1/2 rounded-full bg-primary lt-chase-dot"
            style={{ animationDelay: `${-1.1 + i * 0.1}s` }}
          />
        </div>
      ))}
    </div>
  );
}

export function WanderingCubes() {
  return (
    <div className="relative size-8">
      <span className="absolute left-0 top-0 size-3 rounded-[2px] bg-primary lt-wander" />
      <span className="absolute left-0 top-0 size-3 rounded-[2px] bg-muted-foreground lt-wander" style={{ animationDelay: "-0.9s" }} />
    </div>
  );
}

export function FoldingCube() {
  return (
    <div className="relative size-7" style={{ transform: "rotateZ(45deg)" }}>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="absolute inset-0" style={{ transform: `rotateZ(${i * 90}deg)` }}>
          <span
            className="absolute left-0 top-0 h-1/2 w-1/2 bg-primary lt-fold"
            style={{ transformOrigin: "100% 100%", animationDelay: `${i * 0.3}s` }}
          />
        </div>
      ))}
    </div>
  );
}

export function CubeGrid() {
  return (
    <div className="grid grid-cols-3 gap-[3px]">
      {[0.2, 0.3, 0.4, 0.1, 0.2, 0.3, 0, 0.1, 0.2].map((d, i) => (
        <span key={i} className="size-2 rounded-[2px] bg-primary lt-cube-grid" style={{ animationDelay: `${d}s` }} />
      ))}
    </div>
  );
}

/** 12 dots around a ring, scaling up in sequence. */
export function CircleFade() {
  return (
    <div className="relative size-8">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="absolute inset-0" style={{ transform: `rotate(${i * 30}deg)` }}>
          <span
            className="absolute left-1/2 top-0 size-[20%] rounded-full bg-primary lt-ring-scale"
            style={{ animationDelay: `${-1.1 + i * 0.1}s` }}
          />
        </div>
      ))}
    </div>
  );
}

/** Same ring, opacity instead of scale — calmer. */
export function FadingCircle() {
  return (
    <div className="relative size-8">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="absolute inset-0" style={{ transform: `rotate(${i * 30}deg)` }}>
          <span
            className="absolute left-1/2 top-0 h-[6px] w-[3px] -translate-x-1/2 rounded-full bg-foreground lt-fade-hard"
            style={{ animationDelay: `${-1.1 + i * 0.1}s` }}
          />
        </div>
      ))}
    </div>
  );
}

export function SkWave() {
  return (
    <div className="flex h-8 items-center gap-[3px]">
      {[-1.1, -1, -0.9, -0.8, -0.7].map((d) => (
        <span key={d} className="h-full w-[4px] rounded-sm bg-primary lt-sk-wave" style={{ animationDelay: `${d}s` }} />
      ))}
    </div>
  );
}

// ── Dots ────────────────────────────────────────────────────────────────────

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

/** Single element — all three dots are box-shadows (css-loaders.com trick). */
export function ShadowDots() {
  return <span className="size-2 rounded-full text-primary lt-shadow-dots" />;
}

/** Dots drift in from the left and fade out on the right. */
export function DotStream() {
  return (
    <div className="relative h-2 w-24">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="absolute left-0 top-0 size-2 rounded-full bg-primary lt-dot-stream"
          style={{ animationDelay: `${i * 0.45}s` }}
        />
      ))}
    </div>
  );
}

export function NewtonsCradle() {
  return (
    <div className="flex h-8 items-start">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className={cn("relative h-7 w-2.5", i === 0 && "lt-cradle-l", i === 3 && "lt-cradle-r")}
          style={{ transformOrigin: "top center" }}
        >
          <span className="absolute bottom-0 left-0 size-2.5 rounded-full bg-primary" />
        </div>
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

/** Denser, uneven bars — reads as an audio meter. */
export function SoundWave() {
  return (
    <div className="flex h-8 items-center gap-[3px]">
      {[0.4, 0.7, 1, 0.55, 0.9, 0.45, 1, 0.65, 0.35].map((h, i) => (
        <span
          key={i}
          className="w-[3px] rounded-full bg-primary lt-sound"
          style={{ height: `${h * 100}%`, animationDelay: `${i * 0.09}s` }}
        />
      ))}
    </div>
  );
}

export function FillingBars() {
  return (
    <div className="flex h-8 items-end gap-1.5">
      {[0, 1, 2].map((i) => (
        <div key={i} className="relative h-full w-2 overflow-hidden rounded-sm bg-muted">
          <div
            className="absolute inset-x-0 bottom-0 h-full origin-bottom bg-primary lt-fill"
            style={{ animationDelay: `${i * 0.2}s` }}
          />
        </div>
      ))}
    </div>
  );
}

export function PingPongBar() {
  return (
    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
      <div className="h-full w-[30%] rounded-full bg-primary lt-pingpong" />
    </div>
  );
}

// ── Progress ────────────────────────────────────────────────────────────────

export function IndeterminateBar() {
  return (
    <div className="relative h-1.5 w-24 overflow-hidden rounded-full bg-muted">
      <div className="absolute inset-y-0 w-1/2 rounded-full bg-primary lt-indeterminate" />
    </div>
  );
}

/** MUI CircularProgress: spinning SVG + animated stroke-dasharray. */
export function CircularRing() {
  return (
    <span className="inline-flex size-9 animate-spin text-primary" style={{ animationDuration: "1.4s" }}>
      <svg viewBox="0 0 40 40" className="size-full -rotate-90">
        <circle cx="20" cy="20" r="16" fill="none" strokeWidth="3.5" className="stroke-muted" />
        <circle
          cx="20"
          cy="20"
          r="16"
          fill="none"
          strokeWidth="3.5"
          strokeLinecap="round"
          stroke="currentColor"
          className="lt-dash"
        />
      </svg>
    </span>
  );
}

/** MUI LinearProgress indeterminate: two segments on offset timelines. */
export function QueryBar() {
  return (
    <div className="relative h-1.5 w-24 overflow-hidden rounded-full bg-muted">
      <span className="absolute inset-y-0 bg-primary lt-query-1" />
      <span className="absolute inset-y-0 bg-primary lt-query-2" />
    </div>
  );
}

export function SegmentedSteps() {
  return (
    <div className="flex items-center gap-1">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-1.5 w-5 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-full origin-left bg-primary lt-seg" style={{ animationDelay: `${i * 0.3}s` }} />
        </div>
      ))}
    </div>
  );
}

export function StripedBar() {
  return (
    <div className="h-2.5 w-24 overflow-hidden rounded-full bg-muted text-primary">
      <div
        className="h-full w-[70%] rounded-full lt-stripes"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, currentColor 0 6px, color-mix(in oklch, currentColor 50%, transparent) 6px 12px)",
        }}
      />
    </div>
  );
}

/** MUI buffer variant: filled bar, faded buffer, drifting dot track. */
export function BufferBar() {
  return (
    <div className="relative h-1.5 w-24 overflow-hidden rounded-full bg-muted text-muted-foreground">
      <div
        className="absolute inset-0 lt-buffer-dots"
        style={{ backgroundImage: "radial-gradient(currentColor 0 1px, transparent 1.5px)", backgroundSize: "8px 8px" }}
      />
      <div
        className="absolute inset-y-0 left-0 w-[80%] rounded-full"
        style={{ background: "color-mix(in oklch, currentColor 30%, transparent)" }}
      />
      <div className="absolute inset-y-0 left-0 w-[52%] rounded-full bg-primary" />
    </div>
  );
}

/** Stepper: nodes light up left to right along a rail. */
export function StepDots() {
  return (
    <div className="flex items-center">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center">
          {i > 0 && <span className="h-[2px] w-5 bg-muted" />}
          <span
            className="size-2.5 rounded-full bg-primary lt-step"
            style={{ animationDelay: `${i * 0.25}s` }}
          />
        </div>
      ))}
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

export function PulseRings() {
  return (
    <div className="relative flex size-8 items-center justify-center">
      {[0, 0.5, 1].map((d) => (
        <span key={d} className="absolute inset-0 rounded-full border border-primary lt-ripple" style={{ animationDelay: `${d}s` }} />
      ))}
      <span className="size-2 rounded-full bg-primary" />
    </div>
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

/** Square ↔ circle morph while rotating. */
export function MorphSquare() {
  return <div className="size-6 bg-primary lt-morph" />;
}

// ── Skeletons ───────────────────────────────────────────────────────────────

export function SkeletonTextLines() {
  return (
    <div className="flex w-full flex-col gap-2.5">
      <Bone className="h-3 w-full" />
      <Bone className="h-3 w-[92%]" delay={0.12} />
      <Bone className="h-3 w-[97%]" delay={0.24} />
      <Bone className="h-3 w-[58%]" delay={0.36} />
    </div>
  );
}

export function SkeletonTextWave() {
  return (
    <div className="flex w-full flex-col gap-2.5">
      <Wave className="h-3 w-full" />
      <Wave className="h-3 w-[88%]" delay={0.12} />
      <Wave className="h-3 w-[95%]" delay={0.24} />
      <Wave className="h-3 w-[45%]" delay={0.36} />
    </div>
  );
}

export function SkeletonParagraphBlock() {
  return (
    <div className="flex w-full flex-col gap-4">
      <Bone className="h-4 w-1/3 rounded-md" />
      <div className="flex flex-col gap-2">
        {[100, 96, 99, 93, 62].map((w, i) => (
          <Bone key={w} className="h-2.5" width={`${w}%`} delay={i * 0.1} />
        ))}
      </div>
    </div>
  );
}

export function SkeletonListItem() {
  return (
    <div className="flex w-full items-center gap-3">
      <Bone className="size-10 shrink-0 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Bone className="h-3 w-1/3" delay={0.1} />
        <Bone className="h-2.5 w-3/5" delay={0.2} />
      </div>
    </div>
  );
}

export function SkeletonListWave() {
  return (
    <div className="flex w-full flex-col gap-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <Wave className="size-9 shrink-0 rounded-full" delay={i * 0.14} />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Wave className="h-2.5 w-2/5" delay={i * 0.14 + 0.07} />
            <Wave className="h-2.5 w-4/5" delay={i * 0.14 + 0.14} />
          </div>
          <Wave className="h-6 w-12 shrink-0 rounded-md" delay={i * 0.14 + 0.2} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border p-3">
      <Wave className="h-24 w-full rounded-md" />
      <Wave className="h-3.5 w-3/5" delay={0.1} />
      <div className="flex flex-col gap-2">
        <Wave className="h-2.5 w-full" delay={0.18} />
        <Wave className="h-2.5 w-4/5" delay={0.26} />
      </div>
      <Wave className="mt-1 h-7 w-24 rounded-md" delay={0.34} />
    </div>
  );
}

export function SkeletonProfileHeader() {
  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-start gap-4">
        <Bone className="size-14 shrink-0 rounded-full" />
        <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
          <Bone className="h-4 w-2/5" delay={0.1} />
          <Bone className="h-2.5 w-1/4" delay={0.2} />
        </div>
        <Bone className="h-8 w-20 shrink-0 rounded-md" delay={0.3} />
      </div>
      <div className="flex gap-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Bone className="h-3.5 w-10" delay={0.35 + i * 0.08} />
            <Bone className="h-2 w-14" delay={0.4 + i * 0.08} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonFeedPost() {
  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex items-center gap-3">
        <Wave className="size-9 shrink-0 rounded-full" />
        <div className="flex flex-1 flex-col gap-1.5">
          <Wave className="h-2.5 w-28" delay={0.08} />
          <Wave className="h-2 w-16" delay={0.16} />
        </div>
        <Wave className="size-6 shrink-0 rounded-full" delay={0.24} />
      </div>
      <div className="flex flex-col gap-2">
        <Wave className="h-2.5 w-full" delay={0.28} />
        <Wave className="h-2.5 w-11/12" delay={0.34} />
      </div>
      <Wave className="h-32 w-full rounded-md" delay={0.4} />
      <div className="flex gap-5 pt-0.5">
        {[0, 1, 2].map((i) => (
          <Wave key={i} className="h-4 w-12 rounded-full" delay={0.46 + i * 0.06} />
        ))}
      </div>
    </div>
  );
}

export function SkeletonTable() {
  return (
    <div className="w-full overflow-hidden rounded-lg border">
      <div className="grid grid-cols-[1.6fr_1fr_1fr_0.7fr] gap-3 border-b bg-muted/40 px-3 py-2.5">
        {[0, 1, 2, 3].map((i) => (
          <Bone key={i} className="h-2.5" delay={i * 0.06} />
        ))}
      </div>
      {[0, 1, 2, 3].map((r) => (
        <div key={r} className="grid grid-cols-[1.6fr_1fr_1fr_0.7fr] items-center gap-3 border-b px-3 py-3 last:border-b-0">
          <div className="flex items-center gap-2">
            <Bone className="size-5 shrink-0 rounded-full" delay={r * 0.09} />
            <Bone className="h-2.5 flex-1" delay={r * 0.09 + 0.03} />
          </div>
          <Bone className="h-2.5 w-4/5" delay={r * 0.09 + 0.06} />
          <Bone className="h-2.5 w-3/5" delay={r * 0.09 + 0.09} />
          <Bone className="h-4 w-12 rounded-full" delay={r * 0.09 + 0.12} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonComment() {
  return (
    <div className="flex w-full flex-col gap-4">
      {[0, 1].map((i) => (
        <div key={i} className={cn("flex gap-3", i === 1 && "pl-8")}>
          <Bone className="size-8 shrink-0 rounded-full" delay={i * 0.2} />
          <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-lg rounded-tl-none bg-muted/40 p-3">
            <Bone className="h-2.5 w-24" delay={i * 0.2 + 0.06} />
            <Bone className="h-2 w-full" delay={i * 0.2 + 0.12} />
            <Bone className="h-2 w-3/4" delay={i * 0.2 + 0.18} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonMediaObject() {
  return (
    <div className="flex w-full flex-col gap-4">
      {[0, 1].map((i) => (
        <div key={i} className="flex gap-3">
          <Wave className="aspect-video h-14 shrink-0 rounded-md" delay={i * 0.16} />
          <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
            <Wave className="h-2.5 w-full" delay={i * 0.16 + 0.06} />
            <Wave className="h-2.5 w-3/4" delay={i * 0.16 + 0.12} />
            <Wave className="mt-auto h-2 w-1/3" delay={i * 0.16 + 0.18} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Chart placeholder — bars breathe at different heights. */
export function SkeletonChart() {
  const heights = [0.45, 0.7, 0.55, 0.95, 0.6, 0.8, 0.4, 0.72, 0.5, 0.88, 0.62];
  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <Bone className="h-3 w-1/3" />
        <Bone className="h-2.5 w-14" delay={0.1} />
      </div>
      <div className="flex h-28 items-end gap-1.5 border-b border-l pb-1 pl-1.5">
        {heights.map((h, i) => (
          <div
            key={i}
            className="flex-1 origin-bottom rounded-t-sm bg-muted lt-chart-bar"
            style={{ height: `${h * 100}%`, animationDelay: `${i * 0.08}s` }}
          />
        ))}
      </div>
      <div className="flex justify-between">
        {[0, 1, 2, 3].map((i) => (
          <Bone key={i} className="h-2 w-8" delay={i * 0.08} />
        ))}
      </div>
    </div>
  );
}

export function SkeletonStatTiles() {
  return (
    <div className="grid w-full grid-cols-3 gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-2.5 rounded-lg border p-3">
          <Wave className="h-2 w-3/4" delay={i * 0.12} />
          <Wave className="h-5 w-1/2 rounded-md" delay={i * 0.12 + 0.08} />
          <Wave className="h-2 w-2/3" delay={i * 0.12 + 0.16} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonGallery() {
  return (
    <div className="grid w-full grid-cols-3 gap-2">
      {Array.from({ length: 9 }).map((_, i) => (
        <Wave key={i} className="aspect-square w-full rounded-md" delay={((i % 3) + Math.floor(i / 3)) * 0.12} />
      ))}
    </div>
  );
}

export function SkeletonButtons() {
  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      <Bone className="h-9 w-24 rounded-md" />
      <Bone className="h-9 w-20 rounded-md" delay={0.12} />
      <Bone className="h-9 w-9 rounded-md" delay={0.24} />
      <Bone className="ml-auto h-9 w-28 rounded-full" delay={0.36} />
    </div>
  );
}

export function SkeletonChips() {
  return (
    <div className="flex w-full flex-wrap gap-2">
      {[56, 80, 44, 96, 64, 72, 48].map((w, i) => (
        <Bone key={w} className="h-6 rounded-full" width={w} delay={i * 0.08} />
      ))}
    </div>
  );
}

export function SkeletonForm() {
  return (
    <div className="flex w-full flex-col gap-4">
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-2">
          <Bone className="h-2.5 w-20" delay={i * 0.14} />
          <Bone className="h-9 w-full rounded-md" delay={i * 0.14 + 0.07} />
        </div>
      ))}
      <div className="flex flex-col gap-2">
        <Bone className="h-2.5 w-24" delay={0.28} />
        <Bone className="h-16 w-full rounded-md" delay={0.35} />
      </div>
      <div className="flex justify-end gap-2">
        <Bone className="h-8 w-16 rounded-md" delay={0.42} />
        <Bone className="h-8 w-20 rounded-md" delay={0.49} />
      </div>
    </div>
  );
}

export function SkeletonSidebarNav() {
  return (
    <div className="flex w-full flex-col gap-1.5">
      <Bone className="mb-1 h-2 w-16" />
      {[0.62, 0.48, 0.72, 0.4, 0.55].map((w, i) => (
        <div key={i} className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5">
          <Bone className="size-4 shrink-0 rounded-[3px]" delay={i * 0.1} />
          <Bone className="h-2.5" width={`${w * 100}%`} delay={i * 0.1 + 0.05} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonCodeBlock() {
  const lines = [
    { indent: 0, w: "62%" },
    { indent: 1, w: "78%" },
    { indent: 2, w: "54%" },
    { indent: 2, w: "68%" },
    { indent: 1, w: "34%" },
    { indent: 0, w: "46%" },
  ];
  return (
    <div className="flex w-full flex-col gap-2 rounded-lg border bg-muted/30 p-3">
      {lines.map((line, i) => (
        <div key={i} className="flex items-center gap-2">
          <Bone className="h-2 w-3 shrink-0" delay={i * 0.09} />
          <div style={{ paddingLeft: line.indent * 14, width: line.w }}>
            <Wave className="h-2 w-full" delay={i * 0.09} />
          </div>
        </div>
      ))}
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

export function ButtonLoading() {
  return (
    <div className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground opacity-80">
      <div className="size-3.5 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
      Saving
    </div>
  );
}

export function InlineDots() {
  return (
    <div className="flex items-baseline gap-1.5 text-sm text-muted-foreground">
      Thinking
      <span className="flex items-center gap-0.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-1 rounded-full bg-current lt-fade" style={{ animationDelay: `${i * 0.2}s` }} />
        ))}
      </span>
    </div>
  );
}

export function ShimmerText() {
  return (
    <span
      className="bg-clip-text text-sm font-medium text-transparent lt-text-shimmer"
      style={{
        backgroundImage:
          "linear-gradient(90deg, var(--color-muted-foreground) 0%, var(--color-foreground) 45%, var(--color-muted-foreground) 90%)",
        backgroundSize: "220% 100%",
      }}
    >
      Generating response…
    </span>
  );
}
