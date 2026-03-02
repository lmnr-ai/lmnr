import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  staticFile,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { IntroScene } from "./scenes/IntroScene";
import { ProblemScene } from "./scenes/ProblemScene";
import { CodeBeforeScene } from "./scenes/CodeBeforeScene";
import { CodeAfterScene } from "./scenes/CodeAfterScene";
import { OnboardingScene } from "./scenes/OnboardingScene";
import { DashboardScene } from "./scenes/DashboardScene";
import { OutroScene } from "./scenes/OutroScene";

// Total: 720 frames = 24 seconds at 30fps
//
// Scene breakdown:
//   Intro:         0-109    (110 frames, ~3.7s)
//   Problem:       110-219  (110 frames, ~3.7s)
//   Code Before:   220-319  (100 frames, ~3.3s)
//   Code After:    320-449  (130 frames, ~4.3s)
//   Onboarding:    450-674  (225 frames, ~7.5s) - 3 steps x 75 frames
//   Dashboard:     530-629  -- overlaps with onboarding end, shown after
//   Outro:         630-719  (90 frames, ~3.0s)
//
// Adjusted non-overlapping layout:
const SCENES = {
  intro: { from: 0, duration: 100 },
  problem: { from: 100, duration: 100 },
  codeBefore: { from: 200, duration: 90 },
  codeAfter: { from: 290, duration: 120 },
  onboarding: { from: 410, duration: 225 }, // 3 steps * 75
  dashboard: { from: 635, duration: 85 },
  // No separate outro - we don't have enough frames. Let me recalculate.
};

// Let's recalculate to fit in 720 frames:
// Intro:       0-89     (90 frames, 3s)
// Problem:     90-179   (90 frames, 3s)
// CodeBefore:  180-269  (90 frames, 3s)
// CodeAfter:   270-389  (120 frames, 4s)
// Onboarding:  390-569  (180 frames, 6s = 3 steps x 60 frames)
// Dashboard:   570-649  (80 frames, 2.7s)
// Outro:       650-719  (70 frames, 2.3s)

export const LaminarVideo: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ backgroundColor: "#0F0F0F" }}>
      {/* Background music */}
      <Audio
        src={staticFile("bgm.mp3")}
        volume={(f) =>
          interpolate(f, [0, 30, 680, 720], [0, 0.15, 0.15, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
        }
      />

      {/* Scene 1: Intro */}
      <Sequence from={0} durationInFrames={90} name="Intro">
        <IntroScene />
      </Sequence>

      {/* Transition whoosh */}
      <Sequence from={85}>
        <Audio src={staticFile("whoosh.mp3")} volume={0.4} />
      </Sequence>

      {/* Scene 2: Problem */}
      <Sequence from={90} durationInFrames={90} name="Problem">
        <ProblemScene />
      </Sequence>

      {/* Transition whoosh */}
      <Sequence from={175}>
        <Audio src={staticFile("whoosh.mp3")} volume={0.35} />
      </Sequence>

      {/* Scene 3: Code Before */}
      <Sequence from={180} durationInFrames={90} name="Code Before">
        <CodeBeforeScene />
      </Sequence>

      {/* Transition whoosh */}
      <Sequence from={265}>
        <Audio src={staticFile("whoosh.mp3")} volume={0.35} />
      </Sequence>

      {/* Scene 4: Code After (with Laminar added) */}
      <Sequence from={270} durationInFrames={120} name="Code After">
        <CodeAfterScene />
      </Sequence>

      {/* Transition whoosh */}
      <Sequence from={385}>
        <Audio src={staticFile("whoosh.mp3")} volume={0.35} />
      </Sequence>

      {/* Scene 5: Onboarding (3 steps) */}
      <Sequence from={390} durationInFrames={195} name="Onboarding">
        <OnboardingScene />
      </Sequence>

      {/* Transition whoosh */}
      <Sequence from={580}>
        <Audio src={staticFile("whoosh.mp3")} volume={0.35} />
      </Sequence>

      {/* Scene 6: Dashboard */}
      <Sequence from={585} durationInFrames={80} name="Dashboard">
        <DashboardScene />
      </Sequence>

      {/* Transition whoosh */}
      <Sequence from={660}>
        <Audio src={staticFile("whoosh.mp3")} volume={0.3} />
      </Sequence>

      {/* Scene 7: Outro */}
      <Sequence from={665} durationInFrames={55} name="Outro">
        <OutroScene />
      </Sequence>
    </AbsoluteFill>
  );
};
