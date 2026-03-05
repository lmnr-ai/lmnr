import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

import { getBlogPost } from "@/lib/blog/utils";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let title = "Laminar Blog";
  let description = "";
  let date = "";
  let author = "";
  let tags: string[] = [];

  try {
    const { data } = getBlogPost(slug);
    title = data.title;
    description = data.description || "";
    date = data.date;
    author = data.author?.name || "";
    tags = data.tags || [];
  } catch {
    // Use defaults
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#0a0a0a",
          padding: "60px 80px",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        {/* Top section with logo and blog label */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {/* Laminar logo mark */}
            <svg width="36" height="36" viewBox="0 0 100 100" fill="none">
              <path
                d="M50 5C25 5 10 25 10 50C10 75 30 95 50 95C75 95 90 75 90 50C90 30 75 15 50 15C35 15 25 25 25 40C25 55 35 65 50 65C60 65 70 58 70 50C70 42 63 35 50 35"
                fill="white"
              />
            </svg>
            <span style={{ color: "#ffffff", fontSize: "28px", fontWeight: 600 }}>laminar</span>
          </div>
          <span
            style={{
              color: "#a3a3a3",
              fontSize: "18px",
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "2px",
            }}
          >
            Blog
          </span>
        </div>

        {/* Title and description */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", flex: 1, justifyContent: "center" }}>
          <h1
            style={{
              color: "#ffffff",
              fontSize: title.length > 60 ? "36px" : "44px",
              fontWeight: 700,
              lineHeight: 1.2,
              margin: 0,
              maxWidth: "1000px",
            }}
          >
            {title}
          </h1>
          {description && (
            <p
              style={{
                color: "#a3a3a3",
                fontSize: "20px",
                lineHeight: 1.5,
                margin: 0,
                maxWidth: "900px",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {description.length > 140 ? description.slice(0, 140) + "..." : description}
            </p>
          )}
        </div>

        {/* Bottom section with metadata */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
            {author && <span style={{ color: "#d4d4d4", fontSize: "18px", fontWeight: 500 }}>{author}</span>}
            {date && (
              <span style={{ color: "#737373", fontSize: "18px" }}>
                {new Date(date).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            )}
          </div>
          {tags.length > 0 && (
            <div style={{ display: "flex", gap: "8px" }}>
              {tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  style={{
                    color: "#a3a3a3",
                    fontSize: "14px",
                    border: "1px solid #333333",
                    borderRadius: "9999px",
                    padding: "4px 14px",
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Accent line at bottom */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "4px",
            background: "linear-gradient(90deg, #6366f1, #8b5cf6, #a855f7)",
          }}
        />
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
