// PROTOTYPE — throwaway 404 scene for visual tuning.
"use client";

import "dialkit/styles.css";
import { DialRoot, useDialKit } from "dialkit";
import { Heerich } from "heerich";
import { useCallback, useEffect, useRef, useState } from "react";

import laminarIcon from "@/assets/logo/icon.svg";

const surfaceSwatches = [
  "00",
  "50",
  "100",
  "150",
  "200",
  "250",
  "300",
  "350",
  "400",
  "450",
  "500",
  "550",
  "600",
  "650",
  "700",
  "750",
  "800",
].map((step) => ({ label: `surface-${step}`, value: `var(--color-surface-${step})` }));

const primarySwatches = ["100", "200", "300", "400"].map((step) => ({
  label: `primary-${step}`,
  value: `var(--color-primary-${step})`,
}));

const foregroundSwatches = ["50", "100", "200", "300", "400", "500", "600"].map((step) => ({
  label: `foreground-${step}`,
  value: `var(--color-foreground-${step})`,
}));

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

interface FourOhFourSceneProps {
  heading?: string;
  showHeading?: boolean;
}

export default function FourOhFourScene({ heading = "404", showHeading = true }: FourOhFourSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const [run, setRun] = useState(0);
  const { text, camera, frame, ground, cube, animation } = useDialKit(
    "404 scene",
    {
      camera: {
        startAngle: [45, 0, 360, 1],
        angle: [45, 0, 360, 1],
      },
      text: {
        fontSize: [40, 24, 96, 1],
        tracking: [0.12, -0.1, 0.5, 0.01],
        color: {
          type: "select" as const,
          options: foregroundSwatches,
          default: "var(--color-foreground-100)",
        },
      },
      frame: {
        logoShape: true,
        size: [180, 160, 320, 10],
        radius: [4, 0, 40, 1],
        xOffset: [8, -200, 200, 1],
        yOffset: [54, -100, 100, 1],
        color: { type: "select" as const, options: surfaceSwatches, default: "var(--color-surface-00)" },
        gradient: {
          height: [50, 0, 100, 1],
          opacity: [0.07, 0, 1, 0.01],
        },
      },
      ground: {
        size: [17, 9, 25, 2],
        tileSize: [74, 20, 80, 1],
        color: { type: "select" as const, options: surfaceSwatches, default: "var(--color-surface-250)" },
        opacity: [1, 0, 1, 0.01],
        borderColor: { type: "select" as const, options: surfaceSwatches, default: "var(--color-surface-00)" },
        borderWidth: [2, 0.25, 3, 0.25],
        underlay: {
          color: {
            type: "select" as const,
            options: [...surfaceSwatches, ...primarySwatches],
            default: "var(--color-surface-00)",
          },
          opacity: [1, 0, 1, 0.01],
        },
        depthGradient: {
          backDarken: [50, 0, 100, 1],
        },
      },
      cube: {
        size: [0.85, 0.5, 2, 0.05],
        color: {
          type: "select" as const,
          options: [...primarySwatches, ...surfaceSwatches],
          default: "var(--color-primary-200)",
        },
        opacity: [0.24, 0, 1, 0.01],
        borderColor: {
          type: "select" as const,
          options: [...primarySwatches, ...surfaceSwatches],
          default: "var(--color-primary-200)",
        },
        borderOpacity: [0.3, 0, 1, 0.01],
        borderWidth: [1.5, 0.25, 4, 0.25],
        shading: {
          topDarken: [0, 0, 80, 1],
          leftDarken: [64, 0, 80, 1],
          frontDarken: [32, 0, 80, 1],
        },
        exclamation: {
          color: {
            type: "select" as const,
            options: [...primarySwatches, ...surfaceSwatches, ...foregroundSwatches],
            default: "var(--color-primary-400)",
          },
          size: [0.8, 0.5, 1.5, 0.05],
          thickness: [6, 1, 8, 0.25],
          opacity: [0.64, 0, 1, 0.01],
        },
      },
      animation: {
        duration: [2.85, 0.2, 4, 0.05],
        startHeight: [0.85, 0, 3, 0.05],
        rise: [1.6, 0.5, 2, 0.05],
      },
    },
    { id: "four-oh-four-scene-v28", persist: true }
  );

  const paint = useCallback(
    (progress: number) => {
      const host = hostRef.current;
      if (!host) return;

      const cameraAngle = camera.startAngle + (camera.angle - camera.startAngle) * easeOutCubic(progress);
      const h = new Heerich({ tile: ground.tileSize, camera: { type: "isometric", angle: cameraAngle } });
      const half = Math.floor(ground.size / 2);
      const groundStyle = (x: number, _y: number, z: number) => {
        const backDepth = (x + z + half * 2) / (half * 4);
        const darken = Math.max(0, Math.min(ground.depthGradient.backDarken * backDepth, 100));
        return {
          default: { fill: "none", stroke: "none", opacity: 0 },
          top: {
            fill: `color-mix(in oklch, ${ground.color}, black ${darken}%)`,
            stroke: ground.borderColor,
            strokeWidth: ground.borderWidth,
            opacity: ground.opacity,
          },
        };
      };

      for (let x = -half; x <= half; x++) {
        for (let z = -half; z <= half; z++) {
          if (x === 0 && z === 0) continue;
          h.addGeometry({
            type: "box",
            position: [x, 0, z],
            size: 1,
            scale: [1, 0, 1],
            scaleOrigin: [0.5, 0, 0.5],
            gap: 0,
            style: groundStyle,
          });
        }
      }

      const rise = animation.startHeight - easeOutCubic(progress) * (animation.startHeight + animation.rise);
      const exclamationPoint = (value: number) => 0.5 + (value - 0.5) * cube.exclamation.size;
      h.defineDecal(
        "warning",
        `<path d="M${exclamationPoint(0.14)} .5 L${exclamationPoint(0.62)} .5 M${exclamationPoint(0.8)} .5 L${exclamationPoint(0.86)} .5" fill="none" stroke="${cube.exclamation.color}" stroke-width="${cube.exclamation.thickness}" stroke-opacity="${cube.exclamation.opacity}" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`
      );
      h.addGeometry({
        type: "box",
        position: [0, rise, 0],
        size: 1,
        scale: [cube.size, cube.size, cube.size],
        scaleOrigin: [0.5, 0, 0.5],
        gap: 0,
        style: {
          default: {
            fill: cube.color,
            opacity: cube.opacity,
            stroke: "none",
            strokeWidth: 0,
          },
          top: {
            fill: `color-mix(in oklch, ${cube.color}, black ${cube.shading.topDarken}%)`,
          },
          left: {
            fill: `color-mix(in oklch, ${cube.color}, black ${cube.shading.leftDarken}%)`,
          },
          front: {
            fill: `color-mix(in oklch, ${cube.color}, black ${cube.shading.frontDarken}%)`,
            decal: "warning",
          },
        },
      });

      const framing = new Heerich({ tile: 42, camera: { type: "isometric", angle: cameraAngle } });
      for (let x = -2; x <= 2; x++) {
        for (let z = -2; z <= 2; z++) {
          framing.addGeometry({ type: "box", position: [x, 0, z], size: 1, scale: [1, 0, 1] });
        }
      }
      const viewBox = framing.getBounds(0);
      const sceneCenter = h.project([0.5, 0, 0.5]);
      const framingCenter = framing.project([0.5, 0, 0.5]);
      const cubeCoordinate = (value: number) => 0.5 + (value - 0.5) * cube.size;
      const cubeVertices3d = [
        [0, rise, 0],
        [1, rise, 0],
        [1, rise, 1],
        [0, rise, 1],
        [0, rise + cube.size, 0],
        [1, rise + cube.size, 0],
        [1, rise + cube.size, 1],
        [0, rise + cube.size, 1],
      ].map(([x, y, z]) => [cubeCoordinate(x), y, cubeCoordinate(z)] as [number, number, number]);
      const pathForEdges = (edges: number[][]) =>
        edges
          .map(([from, to]) => {
            let start = cubeVertices3d[from];
            let end = cubeVertices3d[to];
            if (start[1] > 0 && end[1] > 0) return "";
            if (start[1] > 0 || end[1] > 0) {
              const hidden = start[1] > 0 ? start : end;
              const shown = start[1] > 0 ? end : start;
              const ratio = shown[1] / (shown[1] - hidden[1]);
              const intersection = shown.map((value, index) => value + (hidden[index] - value) * ratio) as [
                number,
                number,
                number,
              ];
              if (start[1] > 0) start = intersection;
              else end = intersection;
            }
            const fromPoint = h.project(start);
            const toPoint = h.project(end);
            return `M${fromPoint.x} ${fromPoint.y}L${toPoint.x} ${toPoint.y}`;
          })
          .filter(Boolean)
          .join(" ");
      const visibleWireframe = pathForEdges([
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 0],
        [4, 5],
        [7, 4],
        [0, 4],
        [1, 5],
        [3, 7],
      ]);
      const borderAttributes = `fill="none" stroke="${cube.borderColor}" stroke-width="${cube.borderWidth}" stroke-opacity="${cube.borderOpacity}" stroke-linejoin="round" vector-effect="non-scaling-stroke"`;
      const viewport: [number, number, number, number] = [
        viewBox.x + sceneCenter.x - framingCenter.x,
        viewBox.y + sceneCenter.y - framingCenter.y - frame.yOffset,
        viewBox.w,
        viewBox.h,
      ];
      const gradientHeight = (viewport[3] * frame.gradient.height) / 100;
      const gradientBottom = viewport[1] + viewport[3] + gradientHeight;
      const gradientId = "frame-bottom-gradient";
      host.innerHTML = h.toSVG({
        viewBox: viewport,
        prepend: `<rect x="${viewport[0]}" y="${viewport[1]}" width="${viewport[2]}" height="${viewport[3]}" fill="${ground.underlay.color}" opacity="${ground.underlay.opacity}"/>`,
        append: `<path d="${visibleWireframe}" ${borderAttributes}/><defs><linearGradient id="${gradientId}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="var(--color-primary-200)" stop-opacity="${frame.gradient.opacity}"/><stop offset="1" stop-color="var(--color-primary-200)" stop-opacity="0"/></linearGradient></defs><rect x="${viewport[0]}" y="${gradientBottom - gradientHeight * 2}" width="${viewport[2]}" height="${gradientHeight * 2}" fill="url(#${gradientId})" pointer-events="none"/>`,
      });
    },
    [animation.rise, animation.startHeight, camera, cube, frame.gradient, frame.yOffset, ground]
  );

  useEffect(() => {
    const started = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - started) / (animation.duration * 1000), 1);
      paint(progress);
      if (progress < 1) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [animation.duration, paint, run]);

  return (
    <>
      <button
        type="button"
        onClick={() => setRun((value) => value + 1)}
        className="relative overflow-hidden shadow-2xl"
        style={{
          width: frame.size,
          height: frame.size,
          borderRadius: frame.logoShape ? 0 : frame.radius,
          backgroundColor: frame.color,
          transform: `translateX(${frame.xOffset}px)`,
          maskImage: frame.logoShape ? `url(${laminarIcon.src})` : undefined,
          WebkitMaskImage: frame.logoShape ? `url(${laminarIcon.src})` : undefined,
          maskPosition: "center",
          WebkitMaskPosition: "center",
          maskRepeat: "no-repeat",
          WebkitMaskRepeat: "no-repeat",
          maskSize: "contain",
          WebkitMaskSize: "contain",
        }}
        aria-label="Replay cube animation"
      >
        <div ref={hostRef} className="size-full [&>svg]:size-full" aria-label="A cube emerging from a tiled floor" />
      </button>
      {showHeading && (
        <h1
          className="font-medium"
          style={{ fontSize: text.fontSize, letterSpacing: `${text.tracking}em`, color: text.color }}
        >
          {heading}
        </h1>
      )}
      <DialRoot position="bottom-right" theme="dark" defaultOpen />
    </>
  );
}
