import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";
import { colors, fonts } from "../styles";

export const ProblemScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Heading animation
  const headingOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
  });
  const headingY = interpolate(frame, [0, 20], [30, 0], {
    extrapolateRight: "clamp",
  });

  // Browser window animation
  const browserScale = spring({
    fps,
    frame: frame - 15,
    config: { damping: 14, stiffness: 80 },
  });
  const browserOpacity = interpolate(frame, [15, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Question marks appearing
  const q1Opacity = interpolate(frame, [40, 50], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const q2Opacity = interpolate(frame, [48, 58], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const q3Opacity = interpolate(frame, [56, 66], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Bottom text
  const bottomOpacity = interpolate(frame, [60, 80], [0, 1], {
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
        padding: 80,
      }}
    >
      {/* Heading */}
      <div
        style={{
          opacity: headingOpacity,
          transform: `translateY(${headingY}px)`,
          fontSize: 48,
          fontFamily: fonts.heading,
          fontWeight: 700,
          color: colors.text100,
          textAlign: "center",
          marginBottom: 50,
        }}
      >
        You built a browser agent.
      </div>

      {/* Simple browser window illustration */}
      <div
        style={{
          opacity: browserOpacity,
          transform: `scale(${Math.max(0, browserScale)})`,
          width: 700,
          height: 350,
          borderRadius: 16,
          border: `1px solid ${colors.surface400}`,
          backgroundColor: colors.surface700,
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* Browser toolbar */}
        <div
          style={{
            height: 44,
            backgroundColor: colors.surface600,
            display: "flex",
            alignItems: "center",
            padding: "0 16px",
            gap: 8,
          }}
        >
          <div style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: "#FF5F57" }} />
          <div style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: "#FFBD2E" }} />
          <div style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: "#28C840" }} />
          <div
            style={{
              marginLeft: 16,
              flex: 1,
              height: 28,
              borderRadius: 6,
              backgroundColor: colors.surface800,
              display: "flex",
              alignItems: "center",
              paddingLeft: 12,
              fontSize: 14,
              fontFamily: fonts.mono,
              color: colors.text400,
            }}
          >
            https://example.com
          </div>
        </div>

        {/* Browser content area with robot icon */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "calc(100% - 44px)",
            position: "relative",
          }}
        >
          {/* Robot/agent icon */}
          <div
            style={{
              fontSize: 80,
              opacity: 0.4,
            }}
          >
            🤖
          </div>

          {/* Question marks */}
          <div
            style={{
              position: "absolute",
              top: 20,
              right: 60,
              fontSize: 48,
              color: colors.primary,
              fontWeight: 700,
              opacity: q1Opacity,
              fontFamily: fonts.heading,
            }}
          >
            ?
          </div>
          <div
            style={{
              position: "absolute",
              top: 60,
              right: 120,
              fontSize: 36,
              color: colors.primaryLight,
              fontWeight: 700,
              opacity: q2Opacity,
              fontFamily: fonts.heading,
            }}
          >
            ?
          </div>
          <div
            style={{
              position: "absolute",
              top: 10,
              right: 160,
              fontSize: 42,
              color: colors.primary50,
              fontWeight: 700,
              opacity: q3Opacity,
              fontFamily: fonts.heading,
            }}
          >
            ?
          </div>
        </div>
      </div>

      {/* Bottom question */}
      <div
        style={{
          opacity: bottomOpacity,
          marginTop: 40,
          fontSize: 36,
          fontFamily: fonts.sans,
          color: colors.text300,
          textAlign: "center",
        }}
      >
        But can you see{" "}
        <span style={{ color: colors.primary, fontWeight: 600 }}>
          what it's doing?
        </span>
      </div>
    </AbsoluteFill>
  );
};
