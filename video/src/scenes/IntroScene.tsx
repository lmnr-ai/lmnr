import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";
import { colors, fonts } from "../styles";

export const IntroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Logo animation
  const logoScale = spring({
    fps,
    frame,
    config: { damping: 12, stiffness: 80 },
  });

  const logoOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Tagline fade in
  const taglineOpacity = interpolate(frame, [25, 45], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const taglineY = interpolate(frame, [25, 45], [20, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Subtitle
  const subtitleOpacity = interpolate(frame, [45, 65], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Glow effect pulse
  const glowIntensity = interpolate(
    frame,
    [30, 60, 90],
    [0, 0.6, 0.3],
    { extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.surface800,
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
      }}
    >
      {/* Radial glow behind logo */}
      <div
        style={{
          position: "absolute",
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${colors.primary30} 0%, transparent 70%)`,
          opacity: glowIntensity,
          filter: "blur(60px)",
        }}
      />

      {/* Laminar Logo Text */}
      <div
        style={{
          opacity: logoOpacity,
          transform: `scale(${logoScale})`,
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        {/* Simple geometric logo mark */}
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              color: colors.text100,
              fontSize: 36,
              fontFamily: fonts.heading,
              fontWeight: 800,
            }}
          >
            L
          </div>
        </div>
        <span
          style={{
            fontSize: 72,
            fontFamily: fonts.heading,
            fontWeight: 700,
            color: colors.text100,
            letterSpacing: "-2px",
          }}
        >
          Laminar
        </span>
      </div>

      {/* Tagline */}
      <div
        style={{
          opacity: taglineOpacity,
          transform: `translateY(${taglineY}px)`,
          marginTop: 24,
          fontSize: 32,
          fontFamily: fonts.sans,
          color: colors.primary,
          fontWeight: 600,
        }}
      >
        Observe your AI agents
      </div>

      {/* Subtitle */}
      <div
        style={{
          opacity: subtitleOpacity,
          marginTop: 16,
          fontSize: 22,
          fontFamily: fonts.sans,
          color: colors.text300,
          fontWeight: 400,
        }}
      >
        Tracing, evals, and session replay for browser agents
      </div>
    </AbsoluteFill>
  );
};
