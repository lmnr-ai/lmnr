import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";
import { colors, fonts } from "../styles";

// The lines that are added are marked with isNew: true
const codeLines = [
  { text: "from browser_use import Agent", color: colors.text200, isNew: false },
  { text: "from langchain_openai import ChatOpenAI", color: colors.text200, isNew: false },
  { text: "from lmnr import Laminar, Instruments", color: colors.text200, isNew: true },
  { text: "", color: colors.text200, isNew: false },
  { text: "import asyncio", color: colors.text200, isNew: false },
  { text: "", color: colors.text200, isNew: false },
  { text: "Laminar.initialize(", color: colors.text200, isNew: true },
  { text: "    instruments={Instruments.BROWSER_USE}", color: colors.text200, isNew: true },
  { text: ")", color: colors.text200, isNew: true },
  { text: "", color: colors.text200, isNew: false },
  { text: "async def main():", color: colors.text200, isNew: false },
  { text: "    agent = Agent(", color: colors.text200, isNew: false },
  { text: '        task="Go to google.com and search for Laminar AI",', color: colors.text200, isNew: false },
  { text: "        llm=ChatOpenAI(model=\"gpt-4o\"),", color: colors.text200, isNew: false },
  { text: "    )", color: colors.text200, isNew: false },
  { text: "    result = await agent.run()", color: colors.text200, isNew: false },
  { text: "    print(result)", color: colors.text200, isNew: false },
  { text: "", color: colors.text200, isNew: false },
  { text: "asyncio.run(main())", color: colors.text200, isNew: false },
];

export const CodeAfterScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Title
  const titleOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  // "Just add 3 lines" badge
  const badgeScale = spring({
    fps,
    frame: frame - 10,
    config: { damping: 10, stiffness: 100 },
  });
  const badgeOpacity = interpolate(frame, [10, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Highlight pulse for new lines
  const highlightPulse = interpolate(
    frame,
    [50, 70, 90, 110],
    [0.08, 0.2, 0.08, 0.15],
    { extrapolateRight: "clamp", extrapolateLeft: "clamp" }
  );

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
      {/* Title area */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
          marginBottom: 32,
          opacity: titleOpacity,
        }}
      >
        <div
          style={{
            fontSize: 40,
            fontFamily: fonts.heading,
            fontWeight: 700,
            color: colors.text100,
          }}
        >
          Add Laminar observability
        </div>
        <div
          style={{
            opacity: badgeOpacity,
            transform: `scale(${Math.max(0, badgeScale)})`,
            backgroundColor: colors.primary,
            color: colors.text100,
            fontSize: 18,
            fontFamily: fonts.heading,
            fontWeight: 700,
            padding: "6px 16px",
            borderRadius: 20,
          }}
        >
          Just 3 lines
        </div>
      </div>

      {/* Code editor */}
      <div
        style={{
          width: 900,
          borderRadius: 16,
          border: `1px solid ${colors.surface400}`,
          backgroundColor: colors.surface900,
          overflow: "hidden",
        }}
      >
        {/* Editor titlebar */}
        <div
          style={{
            height: 40,
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
          <span
            style={{
              marginLeft: 16,
              fontSize: 13,
              fontFamily: fonts.mono,
              color: colors.text400,
            }}
          >
            agent.py
          </span>
        </div>

        {/* Code content */}
        <div style={{ padding: "20px 28px" }}>
          {codeLines.map((line, i) => {
            const lineDelay = 15 + i * 3;
            const lineOpacity = interpolate(
              frame,
              [lineDelay, lineDelay + 8],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            );

            return (
              <div
                key={i}
                style={{
                  opacity: lineOpacity,
                  fontSize: 18,
                  fontFamily: fonts.mono,
                  color: line.isNew ? colors.text100 : colors.text300,
                  lineHeight: 1.65,
                  minHeight: line.text === "" ? 18 : "auto",
                  whiteSpace: "pre",
                  backgroundColor: line.isNew
                    ? `rgba(208, 117, 78, ${highlightPulse})`
                    : "transparent",
                  borderLeft: line.isNew
                    ? `3px solid ${colors.primary}`
                    : "3px solid transparent",
                  paddingLeft: 12,
                  marginLeft: -15,
                  borderRadius: line.isNew ? 4 : 0,
                }}
              >
                {highlightSyntax(line.text, line.isNew)}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom note */}
      <div
        style={{
          opacity: interpolate(frame, [80, 100], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          marginTop: 24,
          fontSize: 20,
          fontFamily: fonts.sans,
          color: colors.text400,
        }}
      >
        That's it. Full tracing + browser session recording.
      </div>
    </AbsoluteFill>
  );
};

function highlightSyntax(text: string, isNew: boolean): React.ReactNode {
  const keywords = ["from", "import", "async", "def", "await", "print"];

  if (text.includes('"')) {
    const segments = text.split(/(\"[^\"]*\")/g);
    return (
      <>
        {segments.map((seg, i) => {
          if (seg.startsWith('"')) {
            return (
              <span key={i} style={{ color: colors.successBright }}>
                {seg}
              </span>
            );
          }
          return <span key={i}>{highlightKeywords(seg)}</span>;
        })}
      </>
    );
  }

  if (text.includes("{") && text.includes("}")) {
    const segments = text.split(/(\{[^}]*\})/g);
    return (
      <>
        {segments.map((seg, i) => {
          if (seg.startsWith("{")) {
            return (
              <span key={i} style={{ color: colors.amber }}>
                {seg}
              </span>
            );
          }
          return <span key={i}>{highlightKeywords(seg)}</span>;
        })}
      </>
    );
  }

  return highlightKeywords(text);
}

function highlightKeywords(text: string): React.ReactNode {
  const keywords = ["from", "import", "async", "def", "await", "print"];
  const parts = text.split(/(\s+)/);

  return (
    <>
      {parts.map((part, i) => {
        const trimmed = part.trim();
        if (keywords.includes(trimmed)) {
          return (
            <span key={i} style={{ color: colors.purple }}>
              {part}
            </span>
          );
        }
        if (trimmed === "Laminar" || trimmed === "Instruments" || trimmed === "Laminar.initialize(") {
          return (
            <span key={i} style={{ color: colors.primary }}>
              {part}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
