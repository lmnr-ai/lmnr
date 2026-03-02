import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Img,
  staticFile,
} from "remotion";
import { colors, fonts } from "../styles";

export const DashboardScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Title
  const titleOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });
  const titleY = interpolate(frame, [0, 15], [20, 0], {
    extrapolateRight: "clamp",
  });

  // Dashboard image
  const dashScale = spring({
    fps,
    frame: frame - 10,
    config: { damping: 14, stiffness: 70 },
  });
  const dashOpacity = interpolate(frame, [10, 25], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Features list
  const features = [
    "Full trace visualization",
    "Browser session replay",
    "LLM call inspection",
  ];

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
      {/* Title */}
      <div
        style={{
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
          fontSize: 42,
          fontFamily: fonts.heading,
          fontWeight: 700,
          color: colors.text100,
          marginBottom: 12,
          textAlign: "center",
        }}
      >
        See everything in your{" "}
        <span style={{ color: colors.primary }}>dashboard</span>
      </div>

      {/* Feature pills */}
      <div
        style={{
          display: "flex",
          gap: 16,
          marginBottom: 32,
        }}
      >
        {features.map((feat, i) => {
          const pillOpacity = interpolate(
            frame,
            [20 + i * 8, 30 + i * 8],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );
          return (
            <div
              key={i}
              style={{
                opacity: pillOpacity,
                fontSize: 16,
                fontFamily: fonts.sans,
                color: colors.text200,
                backgroundColor: colors.surface500,
                padding: "8px 20px",
                borderRadius: 20,
                border: `1px solid ${colors.surface400}`,
              }}
            >
              {feat}
            </div>
          );
        })}
      </div>

      {/* Dashboard screenshot */}
      <div
        style={{
          opacity: dashOpacity,
          transform: `scale(${Math.max(0, dashScale)})`,
          width: 1000,
          borderRadius: 16,
          border: `1px solid ${colors.surface400}`,
          overflow: "hidden",
          boxShadow: `0 20px 60px rgba(0,0,0,0.5), 0 0 40px ${colors.primary10}`,
        }}
      >
        <Img
          src={staticFile("traces-dashboard.png")}
          style={{
            width: "100%",
            display: "block",
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
