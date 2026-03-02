import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
} from "remotion";
import { colors, fonts } from "../styles";

const codeLines = [
  { text: "from browser_use import Agent", color: colors.text200 },
  { text: "from langchain_openai import ChatOpenAI", color: colors.text200 },
  { text: "", color: colors.text200 },
  { text: "import asyncio", color: colors.text200 },
  { text: "", color: colors.text200 },
  { text: "async def main():", color: colors.purple },
  { text: "    agent = Agent(", color: colors.text200 },
  { text: '        task="Go to google.com and search for Laminar AI",', color: colors.successBright },
  { text: "        llm=ChatOpenAI(model=\"gpt-4o\"),", color: colors.text200 },
  { text: "    )", color: colors.text200 },
  { text: "    result = await agent.run()", color: colors.text200 },
  { text: "    print(result)", color: colors.text200 },
  { text: "", color: colors.text200 },
  { text: "asyncio.run(main())", color: colors.text200 },
];

export const CodeBeforeScene: React.FC = () => {
  const frame = useCurrentFrame();

  // Title animation
  const titleOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Label animation
  const labelOpacity = interpolate(frame, [5, 20], [0, 1], {
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
      {/* Title */}
      <div
        style={{
          opacity: titleOpacity,
          fontSize: 40,
          fontFamily: fonts.heading,
          fontWeight: 700,
          color: colors.text100,
          marginBottom: 12,
          textAlign: "center",
        }}
      >
        A simple browser agent
      </div>

      {/* Label */}
      <div
        style={{
          opacity: labelOpacity,
          fontSize: 20,
          fontFamily: fonts.sans,
          color: colors.text400,
          marginBottom: 32,
        }}
      >
        Using Browser Use + OpenAI
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
        <div style={{ padding: "24px 32px" }}>
          {codeLines.map((line, i) => {
            const lineDelay = 10 + i * 4;
            const lineOpacity = interpolate(
              frame,
              [lineDelay, lineDelay + 10],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            );

            return (
              <div
                key={i}
                style={{
                  opacity: lineOpacity,
                  fontSize: 20,
                  fontFamily: fonts.mono,
                  color: line.color,
                  lineHeight: 1.7,
                  minHeight: line.text === "" ? 20 : "auto",
                  whiteSpace: "pre",
                }}
              >
                {highlightSyntax(line.text)}
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

function highlightSyntax(text: string): React.ReactNode {
  // Simple syntax highlighting
  const keywords = ["from", "import", "async", "def", "await", "print"];
  const parts: React.ReactNode[] = [];

  // Check for string literals
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

  return highlightKeywords(text);
}

function highlightKeywords(text: string): React.ReactNode {
  const keywords = ["from", "import", "async", "def", "await", "print"];
  const parts = text.split(/(\s+)/);

  return (
    <>
      {parts.map((part, i) => {
        if (keywords.includes(part.trim())) {
          return (
            <span key={i} style={{ color: colors.purple }}>
              {part}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
