"use client";

import { PauseIcon, PlayIcon } from "@radix-ui/react-icons";
import React, { memo, useCallback } from "react";
import { shallow } from "zustand/shallow";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatSecondsToMinutesAndSeconds } from "@/lib/utils";

import { useSessionViewStore } from "../store";

const SPEED_OPTIONS = [1, 2, 4, 8, 16];

interface PlayerControlsProps {
  /** Epoch ms of the first chapter's content start — used for time display. */
  timelineStartMs?: number;
  /** Epoch ms of the last chapter's content end. */
  timelineEndMs?: number;
}

function PlayerControlsInner({ timelineStartMs, timelineEndMs }: PlayerControlsProps) {
  const { isPlaying, playbackSpeed, togglePlay, setPlaybackSpeed, playheadEpochMs } = useSessionViewStore(
    (s) => ({
      isPlaying: s.isPlaying,
      playbackSpeed: s.playbackSpeed,
      togglePlay: s.togglePlay,
      setPlaybackSpeed: s.setPlaybackSpeed,
      playheadEpochMs: s.playheadEpochMs,
    }),
    shallow
  );

  const handleSpeed = useCallback(
    (speed: number) => {
      setPlaybackSpeed(speed);
    },
    [setPlaybackSpeed]
  );

  const elapsedSeconds =
    playheadEpochMs !== undefined && timelineStartMs !== undefined
      ? Math.max(0, (playheadEpochMs - timelineStartMs) / 1000)
      : 0;
  const totalSeconds =
    timelineEndMs !== undefined && timelineStartMs !== undefined
      ? Math.max(0, (timelineEndMs - timelineStartMs) / 1000)
      : 0;

  return (
    <div className="flex items-center gap-2 shrink-0">
      <button
        onClick={togglePlay}
        className="text-foreground py-1 rounded hover:bg-secondary px-1.5"
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? <PauseIcon strokeWidth={1.5} /> : <PlayIcon strokeWidth={1.5} />}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center text-foreground py-1 px-2 rounded text-xs hover:bg-secondary">
          {playbackSpeed}x
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {SPEED_OPTIONS.map((s) => (
            <DropdownMenuItem key={s} onClick={() => handleSpeed(s)}>
              {s}x
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="font-mono text-xs text-muted-foreground tabular-nums whitespace-nowrap">
        {formatSecondsToMinutesAndSeconds(elapsedSeconds)}/{formatSecondsToMinutesAndSeconds(totalSeconds)}
      </span>
    </div>
  );
}

export default memo(PlayerControlsInner);
