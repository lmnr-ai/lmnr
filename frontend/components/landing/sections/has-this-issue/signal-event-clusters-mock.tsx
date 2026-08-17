"use client";

import { motion, useMotionValueEvent, useScroll, useTransform } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { SIGNAL_CLUSTER_ID } from "../signal-cluster";
import { ClusterPill } from "../signal-event-card";
import ClustersCard, { CLUSTERS_CARD_W } from "./clusters-card";
import { DEFAULT_TIMING, easeInOutCubic, easeOutCubic, phase } from "./timing";
import { useClusterBeats } from "./use-cluster-beats";

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

  const timing = DEFAULT_TIMING;

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
  // otherwise never arm. Deferred a frame so the observer has measured.
  useEffect(() => {
    const id = requestAnimationFrame(() => setAct2(scrollYProgress.get() >= armAt));
    return () => cancelAnimationFrame(id);
  }, [armAt, scrollYProgress]);

  const beats = useClusterBeats(act2, timing);

  // ── Pill centring ───────────────────────────────────────────────────────
  // The stage is wider than the frame and parked at its left edge, so the frame
  // only ever shows part of it — centring the pill on the STAGE drops it into
  // the cropped half. Measure the frame and centre on that instead.
  //
  // Both rects are post-transform, so dividing by the stage's measured scale
  // converts back to stage-local px and the mobile 80% scale cancels out. The
  // frame's padding is symmetric, so its box centre is also its content centre.
  const [pillDx, setPillDx] = useState(0);
  useEffect(() => {
    const stage = stageRef.current;
    const frame = stage?.closest<HTMLElement>("[data-clusters-frame]");
    if (!stage || !frame) return;
    const measure = () => {
      const stageBox = stage.getBoundingClientRect();
      const frameBox = frame.getBoundingClientRect();
      const scale = stageBox.width / CLUSTERS_CARD_W;
      if (!scale) return;
      const next = (frameBox.left + frameBox.width / 2 - stageBox.left) / scale - CLUSTERS_CARD_W / 2;
      setPillDx((prev) => (Math.abs(prev - next) < 0.5 ? prev : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  return (
    <TooltipProvider delayDuration={200}>
      <div ref={stageRef} className={cn("relative", className)} style={{ width: CLUSTERS_CARD_W, height: FRAME_H }}>
        {/* Flex-centred on the stage, then translated onto the frame's centre by
            `pillDx` — see the measurement above. */}
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div ref={pillRef} style={{ x: pillDx, y: pillY, opacity: pillOpacity }}>
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
