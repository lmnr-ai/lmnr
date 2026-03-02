import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";
import { colors, fonts } from "../styles";

export const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Logo scale in
  const logoScale = spring({
    fps,
    frame,
    config: { damping: 12, stiffness: 80 },
  });

  const logoOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  // CTA text
  const ctaOpacity = interpolate(frame, [20, 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const ctaY = interpolate(frame, [20, 40], [20, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // URL
  const urlOpacity = interpolate(frame, [40, 55], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Pip install line
  const pipOpacity = interpolate(frame, [50, 65], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Glow
  const glowIntensity = interpolate(
    frame,
    [0, 30, 60],
    [0, 0.5, 0.3],
    { extrapolateRight: "clamp" }
  );

  // Fade out at the end
  const fadeOut = interpolate(frame, [80, 100], [1, 0], {
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
        opacity: fadeOut,
      }}
    >
      {/* Radial glow */}
      <div
        style={{
          position: "absolute",
          width: 800,
          height: 800,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${colors.primary30} 0%, transparent 70%)`,
          opacity: glowIntensity,
          filter: "blur(80px)",
        }}
      />

      {/* Logo */}
      <div
        style={{
          opacity: logoOpacity,
          transform: `scale(${logoScale})`,
          display: "flex",
          alignItems: "center",
          gap: 16,
          marginBottom: 32,
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              color: colors.text100,
              fontSize: 32,
              fontFamily: fonts.heading,
              fontWeight: 800,
            }}
          >
            L
          </div>
        </div>
        <span
          style={{
            fontSize: 60,
            fontFamily: fonts.heading,
            fontWeight: 700,
            color: colors.text100,
            letterSpacing: "-2px",
          }}
        >
          Laminar
        </span>
      </div>

      {/* CTA */}
      <div
        style={{
          opacity: ctaOpacity,
          transform: `translateY(${ctaY}px)`,
          fontSize: 36,
          fontFamily: fonts.heading,
          fontWeight: 600,
          color: colors.text100,
          marginBottom: 24,
          textAlign: "center",
        }}
      >
        Start observing your agents today
      </div>

      {/* pip install */}
      <div
        style={{
          opacity: pipOpacity,
          backgroundColor: colors.surface600,
          border: `1px solid ${colors.surface400}`,
          borderRadius: 12,
          padding: "14px 32px",
          marginBottom: 20,
        }}
      >
        <span
          style={{
            fontSize: 22,
            fontFamily: fonts.mono,
            color: colors.text300,
          }}
        >
          ${" "}
        </span>
        <span
          style={{
            fontSize: 22,
            fontFamily: fonts.mono,
            color: colors.primary,
          }}
        >
          pip install lmnr
        </span>
      </div>

      {/* URL */}
      <div
        style={{
          opacity: urlOpacity,
          fontSize: 24,
          fontFamily: fonts.sans,
          color: colors.text300,
        }}
      >
        <span style={{ color: colors.primary, fontWeight: 600 }}>
          lmnr.ai
        </span>
        {"  "}
        <span style={{ color: colors.text500 }}>|</span>
        {"  "}
        <span style={{ color: colors.text400 }}>Open source</span>
        {"  "}
        <span style={{ color: colors.text500 }}>|</span>
        {"  "}
        <span style={{ color: colors.text400 }}>Y Combinator S24</span>
      </div>
    </AbsoluteFill>
  );
};
