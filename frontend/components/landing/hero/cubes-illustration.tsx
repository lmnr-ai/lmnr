"use client";

import { animate, motion, type MotionValue, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useEffect } from "react";

// Container is a relative div; every cube is an absolutely-positioned
// component that renders its own tiny SVG of 3 iso faces. The container
// computes (left, top) per cell from iso projection math.

const VIEW_W = 281;
const VIEW_H = 778;

// True isometric proportions: diamond aspect = √3 : 1. With TILE_W = 24,
// TILE_H = 24/√3 ≈ 13.86 and the iso side length (= side-face screen height)
// equals TILE_H.
const SQRT3 = Math.sqrt(3);
const TILE_W = 24;
const TILE_H = TILE_W / SQRT3;
const SIDE_H = TILE_H;
const HALF_W = TILE_W / 2;
const HALF_H = TILE_H / 2;

// Empty space between adjacent cubes, in pixels of iso-side distance. The
// grid step is (TILE_H + GAP) along each iso axis, so the cube footprint
// stays TILE_W × TILE_H but cells sit further apart. Now 0 — the grid
// "look" comes from the stroke on each top face instead.
const GAP = 0;
const STEP_SCALE = 1 + GAP / TILE_H;

// Top-face stroke creates the grid lattice now that cubes butt up edge to
// edge. Risers fade this out via useTransform on y as they lift.
const TOP_STROKE = "var(--color-landing-surface-700)";
const TOP_STROKE_WIDTH = 0.5;

const GRID = 32;
const CENTER = Math.floor(GRID / 2); // 16

// Chosen patch: center 5×5 of the grid.
const PATCH_RADIUS = 2;
// Backdrop cubes past the patch's CENTER diagonal (visually closer to the
// viewer than the rise origin) get z-40. A light overlay can then shine up
// through the hole and still be occluded by the cubes that should sit in
// front of the beam.
const FRONT_OF_PATCH = 2 * CENTER;

// Origin = anchor cell (CENTER, CENTER), placed lower-center so the field
// fills the lower half of the canvas.
const ORIGIN_X = VIEW_W / 2;
const ORIGIN_Y = 650;

const isoX = (c: number, r: number) => ORIGIN_X + (c - r) * HALF_W * STEP_SCALE;
const isoY = (c: number, r: number) => ORIGIN_Y + (c + r - 2 * CENTER) * HALF_H * STEP_SCALE;

type Palette = { top: string; left: string; right: string };

// Three-stage palette for the riser fade:
//   BASE  → all gray (figma 4275:21696). Cube is cold.
//   LIT   → gray top, warm orange sides (figma 4276:33044). Beam catches
//           the sides; top still in shadow because the beam is below.
//   accent → per-cube YELLOW / PURPLE / TEAL (figma 4275:25272). Fully on.
// Backdrop cubes sit at LIT statically — the field is already bathed in
// the beam's wash before any cube lifts.
const BASE: Palette = { top: "#2C2C2E", left: "#222224", right: "#1B1B1D" };
const LIT: Palette = { top: "#2C2C2E", left: "#C56C46", right: "#D0754E" };
const YELLOW: Palette = { top: "#E3A008", left: "#F4B82B", right: "#E8AB1D" };
const PURPLE: Palette = { top: "#621ED8", left: "#7D44E2", right: "#7737E4" };
const TEAL: Palette = { top: "#0093A7", left: "#07BDD5", right: "#05A8BE" };

// Backdrop alias — used by BackdropCube.
const INACTIVE = LIT;

const PALETTES = [YELLOW, PURPLE, TEAL];

// Cube SVG geometry — anchored at (0,0) = top-left of bounding box.
const TOP_PTS = `${HALF_W},0 ${TILE_W},${HALF_H} ${HALF_W},${TILE_H} 0,${HALF_H}`;
const LEFT_PTS = `0,${HALF_H} ${HALF_W},${TILE_H} ${HALF_W},${TILE_H + SIDE_H} 0,${HALF_H + SIDE_H}`;
const RIGHT_PTS = `${HALF_W},${TILE_H} ${TILE_W},${HALF_H} ${TILE_W},${HALF_H + SIDE_H} ${HALF_W},${TILE_H + SIDE_H}`;
const CUBE_BOX_H = TILE_H + SIDE_H;

function BackdropCube({ x, y, palette, z }: { x: number; y: number; palette: Palette; z?: number }) {
  return (
    <svg
      width={TILE_W}
      height={CUBE_BOX_H}
      viewBox={`0 0 ${TILE_W} ${CUBE_BOX_H}`}
      style={{
        position: "absolute",
        left: x - HALF_W,
        top: y - HALF_H,
        zIndex: z,
        pointerEvents: "none",
      }}
    >
      <polygon points={RIGHT_PTS} fill={palette.right} />
      <polygon points={LEFT_PTS} fill={palette.left} />
      <polygon points={TOP_PTS} fill={palette.top} stroke={TOP_STROKE} strokeWidth={TOP_STROKE_WIDTH} />
    </svg>
  );
}

const DURATION = 2.6;
// Color animation runs on its own clock (colorProgress motion value) so it
// can start a hair before the rise — cubes "preheat" like coals warming up
// before lifting. Lead is small to keep the effect subtle.
const COLOR_PREHEAT_LEAD = 0.15;
// Within the color animation: 0 → STAGE2_REACH transitions BASE → LIT,
// then STAGE2_REACH → 1 transitions LIT → accent.
const STAGE2_REACH = 0.5;
// Top-face stroke (grid lattice) fades out over the first STROKE_FADE_PX of
// the rise. Small value = cube "detaches" from the grid almost immediately.
const STROKE_FADE_PX = 12;

// Riser repulsion: shove along y away from the pointer (signed dy/dist),
// smoothstep falloff over HOVER_RADIUS, smoothed by RISER_SPRING.
// Gated off until the landing animation has settled (hoverGate).
const HOVER_RADIUS = 100;
const HOVER_STRENGTH = 140;
const RISER_SPRING = { stiffness: 50, damping: 12, mass: 1.5 } as const;

// Intro cover overlay fades out (opacity 1 → 0) before risers begin lifting.
// Kept under the minimum riser delay so the cover is gone before any rise
// starts.
const COVER_FADE_DURATION = 3;

function useRiserRepelY({
  restX,
  restY,
  mouseX,
  mouseY,
  hoverGate,
}: {
  restX: number;
  restY: number;
  mouseX: MotionValue<number>;
  mouseY: MotionValue<number>;
  hoverGate: MotionValue<number>;
}) {
  const target = useTransform([mouseX, mouseY, hoverGate] as MotionValue<number>[], ([mx, my, gate]: number[]) => {
    if (gate === 0) return 0;
    const dx = restX - mx;
    const dy = restY - my;
    const dist = Math.hypot(dx, dy);
    if (dist > HOVER_RADIUS || dist < 0.001) return 0;
    const f = 1 - dist / HOVER_RADIUS;
    const t = f * f * (3 - 2 * f) * gate;
    return (dy / dist) * HOVER_STRENGTH * t;
  });
  return useSpring(target, RISER_SPRING);
}

function RiserCube({
  x,
  y,
  palette,
  rise,
  delay,
  mouseX,
  mouseY,
  hoverGate,
}: {
  x: number;
  y: number;
  palette: Palette;
  rise: number;
  delay: number;
  mouseX: MotionValue<number>;
  mouseY: MotionValue<number>;
  hoverGate: MotionValue<number>;
}) {
  // Three motion values, three timelines:
  //   yMV           → position, the main rise (drives stroke fade too).
  //   colorProgress → 3-stage palette fade (BASE → LIT → accent). Runs on
  //                   its own clock so it can start a touch before the
  //                   rise, giving a subtle "preheating" warm-up.
  //   zMV           → discrete z-index pop once the cube clears the field.
  const yMV = useMotionValue(0);
  const colorProgress = useMotionValue(0);
  const zMV = useMotionValue(0);
  const topFill = useTransform(colorProgress, [0, STAGE2_REACH, 1], [BASE.top, LIT.top, palette.top]);
  const leftFill = useTransform(colorProgress, [0, STAGE2_REACH, 1], [BASE.left, LIT.left, palette.left]);
  const rightFill = useTransform(colorProgress, [0, STAGE2_REACH, 1], [BASE.right, LIT.right, palette.right]);
  const strokeOpacity = useTransform(yMV, [0, -STROKE_FADE_PX], [1, 0]);

  // Repel uses the cube's RESTING (post-rise) position as the anchor. During
  // the rise the cube isn't there yet, but hoverGate is 0 until the rise
  // finishes so the offset is multiplied out anyway.
  const repelY = useRiserRepelY({ restX: x, restY: y - rise, mouseX, mouseY, hoverGate });
  const totalY = useTransform([yMV, repelY] as MotionValue<number>[], ([yv, ry]: number[]) => yv + ry);

  useEffect(() => {
    const yCtrl = animate(yMV, -rise, { duration: DURATION, delay, ease: "easeInOut" });
    // Color animation gets a head start (PREHEAT_LEAD) and runs slightly
    // longer so it still finishes when the rise finishes.
    const colorCtrl = animate(colorProgress, 1, {
      duration: DURATION + COLOR_PREHEAT_LEAD,
      delay: Math.max(0, delay - COLOR_PREHEAT_LEAD),
      ease: "easeInOut",
    });
    // z-index pops once the rise has cleared ~20% — zero-duration step.
    const zCtrl = animate(zMV, 20, { delay: delay + DURATION * 0.2, duration: 0 });
    return () => {
      yCtrl.stop();
      colorCtrl.stop();
      zCtrl.stop();
    };
  }, [rise, delay, yMV, colorProgress, zMV]);

  return (
    <motion.div
      style={{
        y: totalY,
        zIndex: zMV,
        position: "absolute",
        left: x - HALF_W,
        top: y - HALF_H,
        width: TILE_W,
        height: CUBE_BOX_H,
        pointerEvents: "none",
      }}
    >
      <svg width={TILE_W} height={CUBE_BOX_H} viewBox={`0 0 ${TILE_W} ${CUBE_BOX_H}`}>
        <motion.polygon points={RIGHT_PTS} style={{ fill: rightFill }} />
        <motion.polygon points={LEFT_PTS} style={{ fill: leftFill }} />
        <motion.polygon
          points={TOP_PTS}
          stroke={TOP_STROKE}
          strokeWidth={TOP_STROKE_WIDTH}
          style={{ fill: topFill, strokeOpacity }}
        />
      </svg>
    </motion.div>
  );
}

// Per-cell rise heights + delay offsets for the 5x5 patch, row-major
// (ro, co) order: (-2,-2), (-2,-1), …, (-2,2), (-1,-2), … (2, 2). Sampled
// from a teardrop distribution (heaviest near MAX_RISE).
const RISES = [
  310.3, 384.3, 435.4, 240.2, 235.7, 416.6, 185.3, 420.9, 164.8, 392.8, 299.7, 492.0, 397.8, 218.3, 227.3, 419.9, 245.8,
  409.4, 272.6, 192.8, 437.6, 308.2, 132.2, 381.3, 433.7,
];
const DELAYS = [
  0.44, 0.63, 0.56, 1.09, 0.45, 1.02, 0.36, 0.73, 0.73, 0.94, 0.63, 0.51, 0.72, 0.43, 0.77, 0.95, 0.46, 0.33, 0.92,
  0.68, 0.52, 0.32, 0.39, 0.99, 0.91,
];

type Riser = { co: number; ro: number; palette: Palette; rise: number; delay: number };

function buildRisers(): Riser[] {
  const out: Riser[] = [];
  for (let ro = -PATCH_RADIUS; ro <= PATCH_RADIUS; ro++) {
    for (let co = -PATCH_RADIUS; co <= PATCH_RADIUS; co++) {
      const i = co + PATCH_RADIUS + (ro + PATCH_RADIUS) * (2 * PATCH_RADIUS + 1);
      out.push({
        co,
        ro,
        palette: PALETTES[(i * 5 + 1) % PALETTES.length],
        rise: RISES[i],
        delay: DELAYS[i],
      });
    }
  }
  return out;
}

const RISERS = buildRisers();

// Unified cell list: every backdrop cell plus every riser, sorted back-to-
// front (ascending c+r). Risers and backdrop interleave by their grid
// position so a forward backdrop cube correctly obscures a riser at a
// smaller (c+r), and vice versa.
type Cell = {
  c: number;
  r: number;
  x: number;
  y: number;
  riser?: { palette: Palette; rise: number; delay: number };
};

function buildCells(): Cell[] {
  const cells: Cell[] = [];
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const co = c - CENTER;
      const ro = r - CENTER;
      if (Math.abs(co) <= PATCH_RADIUS && Math.abs(ro) <= PATCH_RADIUS) continue;
      const x = isoX(c, r);
      const y = isoY(c, r);
      if (x + HALF_W < 0 || x - HALF_W > VIEW_W) continue;
      if (y + HALF_H + SIDE_H < 0 || y - HALF_H > VIEW_H) continue;
      cells.push({ c, r, x, y });
    }
  }
  for (const riser of RISERS) {
    const c = CENTER + riser.co;
    const r = CENTER + riser.ro;
    cells.push({
      c,
      r,
      x: isoX(c, r),
      y: isoY(c, r),
      riser: { palette: riser.palette, rise: riser.rise, delay: riser.delay },
    });
  }
  cells.sort((a, b) => a.c + a.r - (b.c + b.r));
  return cells;
}

const CELLS = buildCells();

// Beam fade timing — opacity ramps from 0 → 1 once the field is in place.
const BEAM_FADE_DELAY = 0.3;
const BEAM_FADE_DURATION = 2.0;

// Hover repulsion turns on once the latest-firing riser has finished its
// rise, so it can't fight the rise choreography.
const HOVER_GATE_DELAY = Math.max(...DELAYS) + DURATION;
// Position used to seed mouseX/Y so cubes sit still until the pointer
// actually enters the container.
const FAR_OFF = -10000;

const CubesIllustration = ({ className }: { className?: string }) => {
  // Mouse in container-local coords; FAR_OFF means "no pointer". Must be
  // a MotionValue — set imperatively from onMouseMove, read inside
  // useTransform by every riser's repel calc.
  const mouseX = useMotionValue(FAR_OFF);
  const mouseY = useMotionValue(FAR_OFF);
  // hoverGate flips 0 → 1 once the landing animation finishes so the
  // repulsion can't fight the rise choreography. MotionValue because it's
  // read inside useTransform (gated multiplier on the repel offset).
  const hoverGate = useMotionValue(0);

  useEffect(() => {
    const ctrl = animate(hoverGate, 1, { delay: HOVER_GATE_DELAY, duration: 0 });
    return () => ctrl.stop();
  }, [hoverGate]);

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: VIEW_W,
        height: VIEW_H,
        backgroundColor: "#1B1B1C",
        overflow: "hidden",
      }}
      aria-hidden="true"
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        mouseX.set(e.clientX - rect.left);
        mouseY.set(e.clientY - rect.top);
      }}
      onMouseLeave={() => {
        mouseX.set(FAR_OFF);
        mouseY.set(FAR_OFF);
      }}
    >
      <div className="absolute top-0 h-[80%] left-0 right-0 bg-gradient-to-b from-landing-surface-600 to-transparent z-50 pointer-events-none" />

      <div className="absolute top-[50%] h-[32%] left-0 right-0 bg-gradient-to-b from-landing-surface-600 via-60% via-landing-surface-600/80 to-transparent z-10 pointer-events-none" />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: BEAM_FADE_DELAY, duration: BEAM_FADE_DURATION, ease: "easeIn" }}
        className="absolute bottom-0 top-0 left-1/2 w-[120px] -translate-x-1/2 z-30 bg-gradient-to-t from-primary/30 to-transparent pointer-events-none"
      />

      <div className="absolute bottom-0 left-0 right-0 h-[30%] bg-[#F7A886] pointer-events-none" />

      {CELLS.map((cell) => {
        if (cell.riser) {
          return (
            <RiserCube
              key={`${cell.c}-${cell.r}`}
              x={cell.x}
              y={cell.y}
              palette={cell.riser.palette}
              rise={cell.riser.rise}
              delay={cell.riser.delay}
              mouseX={mouseX}
              mouseY={mouseY}
              hoverGate={hoverGate}
            />
          );
        }
        const z = cell.c + cell.r > FRONT_OF_PATCH ? 40 : undefined;
        return <BackdropCube key={`${cell.c}-${cell.r}`} x={cell.x} y={cell.y} palette={INACTIVE} z={z} />;
      })}

      <motion.div
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ duration: COVER_FADE_DURATION }}
        className="absolute inset-0 z-50 bg-landing-surface-600 pointer-events-none"
      />
    </div>
  );
};

export default CubesIllustration;
