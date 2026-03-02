import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Img,
  staticFile,
  Sequence,
} from "remotion";
import { colors, fonts } from "../styles";

// Each step of the onboarding
const steps = [
  {
    number: "01",
    title: "Sign up",
    description: "Create your account at lmnr.ai",
    image: "sign-in.png",
  },
  {
    number: "02",
    title: "Create a project",
    description: "Set up your workspace and first project",
    image: "onboarding.png",
  },
  {
    number: "03",
    title: "Get your API key",
    description: "Generate a project API key for your agent",
    image: "api-key.png",
  },
];

const StepCard: React.FC<{
  step: (typeof steps)[number];
  index: number;
}> = ({ step, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const cardScale = spring({
    fps,
    frame,
    config: { damping: 12, stiffness: 80 },
  });

  const cardOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  const imageOpacity = interpolate(frame, [10, 25], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const textOpacity = interpolate(frame, [15, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.surface800,
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        padding: 60,
      }}
    >
      {/* Step number and title */}
      <div
        style={{
          opacity: cardOpacity,
          transform: `scale(${cardScale})`,
          display: "flex",
          alignItems: "center",
          gap: 16,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            fontSize: 24,
            fontFamily: fonts.mono,
            color: colors.primary,
            fontWeight: 700,
            backgroundColor: colors.primary10,
            padding: "4px 14px",
            borderRadius: 8,
            border: `1px solid ${colors.primary30}`,
          }}
        >
          {step.number}
        </div>
        <div
          style={{
            fontSize: 42,
            fontFamily: fonts.heading,
            fontWeight: 700,
            color: colors.text100,
          }}
        >
          {step.title}
        </div>
      </div>

      {/* Description */}
      <div
        style={{
          opacity: textOpacity,
          fontSize: 22,
          fontFamily: fonts.sans,
          color: colors.text300,
          marginBottom: 32,
        }}
      >
        {step.description}
      </div>

      {/* Screenshot */}
      <div
        style={{
          opacity: imageOpacity,
          width: 900,
          borderRadius: 16,
          border: `1px solid ${colors.surface400}`,
          overflow: "hidden",
          boxShadow: `0 20px 60px rgba(0,0,0,0.5), 0 0 40px ${colors.primary10}`,
        }}
      >
        <Img
          src={staticFile(step.image)}
          style={{
            width: "100%",
            display: "block",
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

export const OnboardingScene: React.FC = () => {
  const stepDuration = 65; // frames per step

  return (
    <AbsoluteFill>
      {steps.map((step, index) => (
        <Sequence
          key={index}
          from={index * stepDuration}
          durationInFrames={stepDuration}
          name={`Step ${step.number}`}
        >
          <StepCard step={step} index={index} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
