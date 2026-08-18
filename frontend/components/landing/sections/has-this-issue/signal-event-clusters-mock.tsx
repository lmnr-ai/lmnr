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

// The frame the reader sees: the grey panel is exactly this tall with no
// vertical padding, so the stage IS the frame. It is also the pill's budget —
// the visible fall is `(FRAME_H − card) / 2 − pillOverhang − pill height`, about
// 76px, so a taller frame buys a longer drop and nothing else.
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
/** …and the ramp finishes HERE, partway through the enter, not at 1: past this
 *  the pill is roofed by the opaque card and the rest of the fade happens out of
 *  sight, which is how a fade to 0.5 ends up looking like 0.8. */
const PILL_FADE_END = 0.4;

// The pill falls in from above while the card rises to meet it (Act 1, scroll),
// then the rows and chart arrive (Act 2, time). Two layers, both filling the
// stage and flex-centred, so each needs only a `y` offset — and the pill's is
// painted FIRST, so it slides BEHIND the card rather than fading out over it.
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

  // Act 1 opens with the stage's top edge three quarters down the viewport, not
  // when it clears the bottom, where the fall used to play out and be missed.
  // Its length barely moves between displays, which keeps the pill phases
  // winning against the scroll — see the physics note in ./timing.
  const { scrollYProgress } = useScroll({ target: stageRef, offset: ["start 0.75", "center center"] });

  // Function-form transforms, not [in]/[out] ranges: they close over `timing`,
  // so Motion re-runs the closure on every render.
  const pillFall = useTransform(scrollYProgress, (t) => easeOutCubic(phase(t, timing.pillFallAt, timing.pillFallSpan)));
  const cardRise = useTransform(scrollYProgress, (t) =>
    easeOutCubic(phase(t, timing.clusterRiseAt, timing.clusterRiseSpan))
  );
  const pillEnter = useTransform(scrollYProgress, (t) =>
    easeInOutCubic(phase(t, timing.pillEnterAt, timing.pillEnterSpan))
  );

  // Both layers are flex-centred, so everything below is an offset from the
  // stage's CENTRE, and the card rests at 0. The pill hangs off the CARD's top
  // edge, and the layer already centres its MIDDLE — hence the + pillH / 2.
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

  // The stage is wider than the frame and parked at its left edge, so centring
  // the pill on the STAGE drops it into the cropped half — measure the frame
  // instead. Both rects are post-transform, so dividing by the measured scale
  // converts back to stage-local px and the mobile 80% cancels out.
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
