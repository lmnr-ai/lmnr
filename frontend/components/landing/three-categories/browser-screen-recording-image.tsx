"use client";

import MuxPlayer from "@mux/mux-player-react";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";

import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

const BrowserScreenRecordingImage = ({ className }: Props) => {
  const ref = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const scale = useTransform(scrollYProgress, [0, 0.4, 0.5, 1], [1, 1.1, 1.4, 1.5]);
  const y = useTransform(scrollYProgress, [0, 0.2, 0.35, 0.5, 1], [20, 20, -20, -30, -40]);

  return (
    <div
      ref={ref}
      className={cn(
        "h-full bg-landing-surface-600 outline outline-landing-surface-500  pt-[24px] pl-[48px] rounded-lg overflow-hidden",
        className
      )}
    >
      <motion.div style={{ scale, y, transformOrigin: "bottom left" }} className="w-full h-full">
        <MuxPlayer
          playbackId="PWJshBMOuW8BxtJs8JD02CRYrctpsdeVv00aa00krz00rSU"
          metadata={{
            video_title: "Browser session capture",
          }}
          autoPlay={true}
          muted={true}
          loop={true}
          thumbnailTime={0}
          style={
            {
              width: "100%",
              height: "100%",
              "--media-object-fit": "cover",
              "--media-object-position": "left center",
              // Hide all controls at once
              "--controls": "none",
              // Hide the error dialog
              "--dialog": "none",
              // Hide the loading indicator
              "--loading-indicator": "none",
              // Target all sections by excluding the section prefix
              "--play-button": "none",
              "--live-button": "none",
              "--seek-backward-button": "none",
              "--seek-forward-button": "none",
              "--mute-button": "none",
              "--captions-button": "none",
              "--airplay-button": "none",
              "--pip-button": "none",
              "--fullscreen-button": "none",
              "--cast-button": "none",
              "--playback-rate-button": "none",
              "--volume-range": "none",
              "--time-range": "none",
              "--time-display": "none",
              "--duration-display": "none",
              "--rendition-menu-button": "none",
              // Target a specific section by prefixing the CSS var with (top|center|bottom)
              "--center-controls": "none",
              "--bottom-play-button": "none",
            } as React.CSSProperties
          }
          className="rounded overflow-hidden"
        />
      </motion.div>
    </div>
  );
};

export default BrowserScreenRecordingImage;
