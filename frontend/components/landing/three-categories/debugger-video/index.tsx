"use client";

import MuxPlayer from "@mux/mux-player-react";
import { Loader2 } from "lucide-react";
import { type ElementRef, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import ChapterButton from "./chapter-button";

const chapters = [
  { label: "Run local,\ndebug in browser", startTime: 0 },
  { label: "Rerun at step N with\nprevious context preserved", startTime: 26 },
  { label: "Tune your\nsystem prompts", startTime: 37 },
  { label: "Instantly reflect\nchanges as you save", startTime: 50 },
];

const DebuggerVideo = () => {
  const playerRef = useRef<ElementRef<typeof MuxPlayer>>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const getChapterDuration = (index: number) => {
    const videoDuration = playerRef.current?.duration ?? 0;
    const nextChapterStart = chapters[index + 1]?.startTime ?? videoDuration;
    return nextChapterStart - chapters[index].startTime;
  };

  const activeChapterIndex = Math.max(
    0,
    chapters.findLastIndex((chapter) => currentTime >= chapter.startTime)
  );

  const getChapterProgress = () => {
    const chapterStart = chapters[activeChapterIndex].startTime;
    const chapterDuration = getChapterDuration(activeChapterIndex);
    if (chapterDuration <= 0) return 0;
    const elapsed = currentTime - chapterStart;
    return Math.min(Math.max((elapsed / chapterDuration) * 100, 0), 100);
  };

  const handleChapterClick = (startTime: number) => {
    if (playerRef.current) {
      playerRef.current.currentTime = startTime;
    }
  };

  const handleTimeUpdate = () => {
    if (playerRef.current) {
      setCurrentTime(playerRef.current.currentTime);
    }
  };

  return (
    <div className="w-full flex flex-col gap-9">
      <div className="flex md:gap-7 items-end gap-2">
        {chapters.map((chapter, i) => (
          <ChapterButton
            key={i}
            label={chapter.label}
            isActive={i === activeChapterIndex}
            progress={i === activeChapterIndex ? getChapterProgress() : 0}
            onClick={() => handleChapterClick(chapter.startTime)}
          />
        ))}
      </div>

      <div className="relative w-full aspect-[74/45] border border-landing-surface-400 rounded-lg overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <Loader2 size={40} className="text-landing-text-400 animate-spin" />
          </div>
        )}
        <MuxPlayer
          ref={playerRef}
          className={cn("block", { invisible: isLoading })}
          playbackId="GHkdcXx8unYRtXWDvuSoY8LDwDgWAx6p5soFBTI02vTU"
          metadata={{
            video_title: "Debugger",
          }}
          autoPlay={true}
          muted={true}
          loop={true}
          preload="auto"
          minResolution="1080p"
          thumbnailTime={0}
          onTimeUpdate={handleTimeUpdate}
          onCanPlay={() => setIsLoading(false)}
          style={
            {
              width: "100%",
              height: "auto",
              "--media-background-color": "transparent",
              "--controls": "none",
              "--dialog": "none",
              "--loading-indicator": "none",
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
              "--center-controls": "none",
              "--bottom-play-button": "none",
            } as React.CSSProperties
          }
        />
      </div>
    </div>
  );
};

export default DebuggerVideo;
