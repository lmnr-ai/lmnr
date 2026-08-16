"use client";

import { motion, useMotionValueEvent, useScroll, useTransform } from "framer-motion";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { SIGNAL_CLUSTER_ID } from "../signal-cluster";
import { ClusterPill } from "../signal-event-card";
import ClustersCard, { CLUSTER_COUNT, CLUSTERS_CARD_W } from "./clusters-card";
import { type ClustersTiming, DEFAULT_TIMING, easeInOutCubic, easeOutCubic, phase } from "./timing";

// Dev-only live tuning. `IS_DEV` is inlined at build time, so the whole
// dynamic() call — and the dialkit chunk behind it — is dead code in a
// production build and never reaches the landing bundle.
const IS_DEV = process.env.NODE_ENV !== "production";
const TimingDials = IS_DEV
  ? dynamic(() => import("./timing-dials.tsx").then((mod) => mod.default), { ssr: false })
  : null;

// The frame the reader sees — the grey panel is exactly this tall and carries
// no vertical padding of its own, so the stage IS the frame. Fixed rather than
// derived from the card, which is what keeps the card dead centre.
//
// It is also the pill's budget. The frame clips, so the visible fall is only
// whatever is left over above the card:
//
//   runway      = (FRAME_H − card height) / 2          = 128
//   visible fall = runway − pillOverhang − pill height  ≈  76
//
// Those three numbers move together. A taller frame buys a longer drop and
// nothing else; shortening it to 540 costs the drop about 120px of its travel,
// which is paid back by keeping the fall phase very short in scroll terms (see
// the physics note in ./timing).
const FRAME_H = 540;

// Seeds so the first paint is close before anything is measured. Both are
// replaced by real measurements within a frame.
const CLUSTERS_CARD_H_ESTIMATE = 292;
const PILL_H_ESTIMATE = 28;

/** Act 2 disarms this far BELOW its arming point, not at it — otherwise a
 *  scroll resting exactly on the trigger re-runs the whole thing on every
 *  jitter of the wheel. */
const ACT2_HYSTERESIS = 0.06;

/** The pill dims as the card takes it in, so the last of it visible above the
 *  card's edge is already half gone — absorbed rather than merely covered. */
const PILL_ABSORBED_OPACITY = 0.5;
/** …and the ramp finishes here, partway through the enter, NOT at 1. The card
 *  is opaque and painted over the pill, so past roughly this point the pill is
 *  roofed by the card's top edge and any remaining fade happens out of sight.
 *  Spreading it over the whole phase spends four fifths of the effect where
 *  nobody can see it, which is how a fade to 0.5 ends up looking like 0.8. */
const PILL_FADE_END = 0.4;

// One flag per Act 2 track. Each is flipped by its own absolute timer, so
// tracks are independent and free to overlap — there is no phase counter that
// would force them into sequence. See ./timing for the schedule.
interface Beats {
  /** The pill is inside the card: its cluster gains one event. */
  landed: boolean;
  /** Clusters discovered so far; "Unclustered Events" is not counted. */
  revealed: number;
  pulsing: boolean;
  chartArmed: boolean;
}

const AT_REST: Beats = { landed: false, revealed: 0, pulsing: false, chartArmed: false };
const SETTLED: Beats = { landed: true, revealed: CLUSTER_COUNT, pulsing: false, chartArmed: true };

// The clusters animation:
//
//   ╭─pill─╮  ← falls in from above the panel
//        ╷
//        ▼                                            ─ ─ ─ ─
//   ┌──────────────────┐   ╭pill╮            ┌──────────────────┐
//   │ ○ Unclustered    │   ══▼═══════════▶   │ ▣ landed  pulse  │  ← appears
//   └──────────────────┘   into the card     │ ▣ ▣ ▣  staggered │  ← then these
//     ▲ rises from below                     │ ○ Unclustered    │
//                                            │ ▁▃▅▂▇ bars       │  ← and the chart
//        ── Act 1: scroll ──                 └──────────────────┘
//                                               ── Act 2: time ──
//
// Two layers, both absolutely filling the stage and both flex-centred, so each
// only ever needs a `y` offset from centre. The pill layer is painted FIRST
// (below), which is what lets the pill slide behind the opaque clusters card
// rather than fading out over it — and what makes the top lane read as empty
// space the pill falls THROUGH rather than a gap above a card.
const SignalEventClustersMock = ({ className }: { className?: string }) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const clustersRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);

  const [timing, setTiming] = useState<ClustersTiming>(DEFAULT_TIMING);
  const [runId, setRunId] = useState(0);
  const [beats, setBeats] = useState<Beats>(AT_REST);

  const [pillH, setPillH] = useState(PILL_H_ESTIMATE);
  const [clustersH, setClustersH] = useState(CLUSTERS_CARD_H_ESTIMATE);

  useEffect(() => {
    const card = clustersRef.current;
    const pill = pillRef.current;
    if (!card || !pill) return;
    const round = (set: (fn: (prev: number) => number) => void, next: number) =>
      set((prev) => (Math.abs(prev - next) < 0.5 ? prev : next));
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === card) round(setClustersH, entry.contentRect.height);
        else round(setPillH, entry.contentRect.height);
      }
    });
    observer.observe(card);
    observer.observe(pill);
    return () => observer.disconnect();
  }, []);

  // ── Act 1 ───────────────────────────────────────────────────────────────
  // Opens once the stage's top edge is three quarters of the way down the
  // viewport — NOT when it clears the bottom, which is where the fall used to
  // play out and be missed — and closes with the stage centred.
  //
  // Length is `stageHeight / 2 + 0.25 × viewport`, so it barely moves between
  // displays: a 1500px-tall screen only stretches it by ~200px rather than
  // doubling it, which keeps the pill phases winning against the scroll (see
  // the physics note in ./timing).
  const { scrollYProgress } = useScroll({ target: stageRef, offset: ["start 0.75", "center center"] });

  // Function-form transforms, not [in]/[out] ranges: they close over `timing`,
  // which the dials replace on the fly, and Motion re-runs the closure on every
  // render.
  const pillFall = useTransform(scrollYProgress, (t) => easeOutCubic(phase(t, timing.pillFallAt, timing.pillFallSpan)));
  const cardRise = useTransform(scrollYProgress, (t) =>
    easeOutCubic(phase(t, timing.clusterRiseAt, timing.clusterRiseSpan))
  );
  const pillEnter = useTransform(scrollYProgress, (t) =>
    easeInOutCubic(phase(t, timing.pillEnterAt, timing.pillEnterSpan))
  );

  // Both layers are flex-centred on the stage, so everything below is an offset
  // from the stage's CENTRE — and the card's resting offset is 0, i.e. dead
  // centre of the frame, which is where it has to end up once the pill is gone.
  // The pill hangs off the CARD's top edge, not off the frame's.
  //
  // The layer's own centring already puts the pill's MIDDLE at 0 — hence the
  // + pillH / 2.
  const pillRestY = -clustersH / 2 - timing.pillOverhang + pillH / 2;
  // Above the panel's top edge, so the fall starts out of sight.
  const pillStartY = pillRestY - timing.pillFallFrom;
  // Far enough down to be fully behind the card's top edge.
  const pillLandedY = pillRestY + timing.pillOverhang + pillH + timing.dropOvershoot;

  const pillY = useTransform(
    [pillFall, pillEnter],
    ([fall, enter]: number[]) => pillStartY + (pillRestY - pillStartY) * fall + (pillLandedY - pillRestY) * enter
  );
  const cardY = useTransform(cardRise, (r) => (1 - r) * timing.clusterRiseFrom);
  const pillOpacity = useTransform(pillEnter, [0, PILL_FADE_END], [1, PILL_ABSORBED_OPACITY]);

  // ── Act 1 → Act 2 hand-off ──────────────────────────────────────────────
  const [act2, setAct2] = useState(false);
  const armAt = timing.act2At;
  useMotionValueEvent(scrollYProgress, "change", (t) =>
    setAct2((on) => (on ? t >= armAt - ACT2_HYSTERESIS : t >= armAt))
  );
  // "change" only fires on a CHANGE, so a reload that lands past the trigger
  // (or a dial that drags the trigger under the current scroll position) would
  // otherwise never arm.
  useEffect(() => setAct2(scrollYProgress.get() >= armAt), [armAt, scrollYProgress]);

  // ── Act 2 ───────────────────────────────────────────────────────────────
  // Depend on the values, not the object — the dials hand back a fresh object
  // every render, and re-running the schedule on each one would stutter it.
  const timingKey = JSON.stringify(timing);

  useEffect(() => {
    // Disarmed: snap back to empty, ready to replay on the way back down. The
    // cluster rows animate their own height out (see ./cluster-list), so this
    // is not the hard cut it looks like.
    if (!act2) {
      setBeats(AT_REST);
      return;
    }

    setBeats(AT_REST);

    // Act 1 is left scrubbing even here — it is driven by the reader's own
    // scroll, so it is not motion they did not ask for. Act 2 is, so it lands
    // in one frame instead.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setBeats(SETTLED);
      return;
    }

    const t = timing;
    // Every time below is absolute from this moment, so tracks may overlap.
    const at = (ms: number, patch: Partial<Beats>) => setTimeout(() => setBeats((prev) => ({ ...prev, ...patch })), ms);

    const timers = [
      // The pill's landing IS the cluster appearing, so both fire together.
      at(t.landedAt, { landed: true, revealed: 1, pulsing: true }),
      at(t.landedAt + t.pulseMs, { pulsing: false }),
      // Clusters 2..N. Each keeps `revealed` monotonic via Math.max so an
      // out-of-order dial (a stagger dragged behind `landedAt`) can't un-reveal
      // a row that is already on screen.
      ...Array.from({ length: CLUSTER_COUNT - 1 }, (_, i) => {
        const n = i + 2;
        return setTimeout(
          () => setBeats((prev) => ({ ...prev, revealed: Math.max(prev.revealed, n) })),
          t.revealAt + i * t.revealStagger
        );
      }),
      at(t.chartAt, { chartArmed: true }),
    ];
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [act2, runId, timingKey]);

  const replay = useCallback(() => setRunId((n) => n + 1), []);

  return (
    <TooltipProvider delayDuration={200}>
      {TimingDials && <TimingDials onChange={setTiming} onReplay={replay} />}
      <div ref={stageRef} className={cn("relative", className)} style={{ width: CLUSTERS_CARD_W, height: FRAME_H }}>
        {/* Centred from `sm` up, left-parked below it. The 720px stage runs off
            a phone screen and the frame shows roughly its left half, so a
            stage-centred pill drops into the half that gets cropped. 22px puts
            it over the cluster LIST column instead — on screen, and landing on
            the very row it is about to become. */}
        <div className="absolute inset-0 flex items-center justify-start sm:justify-center pl-[22px] sm:pl-0">
          <motion.div ref={pillRef} style={{ y: pillY, opacity: pillOpacity }}>
            <ClusterPill />
          </motion.div>
        </div>

        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div ref={clustersRef} style={{ y: cardY, opacity: cardRise }}>
            <ClustersCard
              armed={beats.chartArmed}
              entered={beats.landed}
              pulsingClusterId={beats.pulsing ? SIGNAL_CLUSTER_ID : null}
              pulseMs={timing.pulseMs}
              revealedCount={beats.revealed}
              revealMs={timing.revealMs}
            />
          </motion.div>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default SignalEventClustersMock;
