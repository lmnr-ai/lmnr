"use client";

import { cn } from "@/lib/utils";
import MuxPlayer from "@mux/mux-player-react";

interface Props {
  className?: string;
}

const BrowserScreenRecordingImage = ({ className }: Props) => {
  return (
    <div className={cn("w-full aspect-square", className)}>
      <MuxPlayer
        playbackId="N2QzSAaeGCvsJ4lzAw2MOIpRPDx7YzFQsZG02fSlUj7g"
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
        className="border border-white/15 rounded overflow-hidden"
      />
    </div>
  );
};

export default BrowserScreenRecordingImage;
