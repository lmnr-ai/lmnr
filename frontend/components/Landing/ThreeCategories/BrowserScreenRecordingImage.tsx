"use client";

import { cn } from "@/lib/utils";
import { useRef, useState, useEffect } from "react";
import { MessageCircle, Bolt, Play } from "lucide-react";

interface Props {
  className?: string;
}

// Span data with timestamps in seconds from start of video
const spanData = [
  { name: "navigate", timestamp: 0, type: "tool" as const },
  { name: "gemini.generate_content", timestamp: 3.667, type: "llm" as const },
  { name: "click", timestamp: 5.577, type: "tool" as const },
  { name: "gemini.generate_content", timestamp: 9.007, type: "llm" as const },
  { name: "click", timestamp: 11.233, type: "tool" as const },
  { name: "gemini.generate_content", timestamp: 14.367, type: "llm" as const },
  { name: "extract", timestamp: 16.533, type: "tool" as const },
  { name: "gemini.generate_content", timestamp: 16.744, type: "llm" as const },
  { name: "gemini.generate_content", timestamp: 20.021, type: "llm" as const },
  { name: "done", timestamp: 22.025, type: "tool" as const },
];

const BrowserScreenRecordingImage = ({ className }: Props) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentSpan, setCurrentSpan] = useState(spanData[0]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);

      // Find the current span based on video time
      let activeSpan = spanData[0];
      for (let i = 0; i < spanData.length; i++) {
        if (video.currentTime >= spanData[i].timestamp) {
          activeSpan = spanData[i];
        } else {
          break;
        }
      }
      setCurrentSpan(activeSpan);
    };

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      // Try to play once metadata is loaded
      video.play().catch(() => {
        // Autoplay might be blocked, that's okay
      });
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);

    // Load and try to play the video
    video.load();

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, []);

  // Use intersection observer to play when visible
  useEffect(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            video.play().catch(() => {
              // Autoplay blocked, user will need to interact
            });
          }
        });
      },
      { threshold: 0.5 }
    );

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, []);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "bg-landing-surface-600 flex flex-col overflow-hidden rounded-[4px] border border-landing-text-600",
        className
      )}
    >
      {/* Top section - Current span indicator */}
      <div className="bg-landing-surface-400 flex items-center px-3 py-2 w-full border-b border-b-landing-text-600">
        <div className="flex gap-2.5 items-center">
          <div
            className={cn(
              "flex items-center justify-center p-1 rounded",
              currentSpan.type === "llm" ? "bg-[#743fe3]" : "bg-[#eab308]"
            )}
          >
            {currentSpan.type === "llm" ? (
              <MessageCircle className="size-5 text-white" />
            ) : (
              <Bolt className="size-5 text-white" />
            )}
          </div>
          <p className="font-sans text-xl text-landing-text-200">{currentSpan.name}</p>
        </div>
      </div>

      {/* Second section - Play icon and slider */}
      <div className="flex gap-3 items-center justify-center px-3 py-2 w-full">
        <div className="flex items-center justify-center shrink-0">
          <Play className="size-5 text-landing-text-300 fill-landing-text-300" />
        </div>
        <div className="flex-1 flex items-center">
          <input
            type="range"
            min="0"
            max={duration || 0}
            value={currentTime}
            onChange={handleSliderChange}
            step="0.01"
            className="w-full h-1.5 bg-landing-text-400 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-landing-text-300 [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-landing-text-300 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
          />
        </div>
      </div>

      {/* Third section - URL display */}
      <div className="flex items-center justify-center px-3 py-1 w-full">
        <p className="font-chivo-mono text-base text-landing-text-400 w-full">https://www.ycombinator.com/companies</p>
      </div>

      {/* Fourth section - Video player */}
      <div className="flex-1 bg-landing-surface-400 flex items-center justify-center w-full">
        <video ref={videoRef} className="w-full h-full object-cover" loop playsInline muted autoPlay>
          <source src="/assets/landing/browser-screen-recording-example.mp4" type="video/mp4" />
        </video>
      </div>
    </div>
  );
};

export default BrowserScreenRecordingImage;
