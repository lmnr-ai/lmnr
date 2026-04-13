import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

import { getBlogPost } from "@/lib/blog/utils";
import { loadOgFonts, OgContainer, OgHeader } from "@/lib/og/og-layout";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let title = "Laminar Blog";
  let description = "";
  let date = "";
  let author = "";
  let tags: string[] = [];

  const post = await getBlogPost(slug);
  if (post) {
    const { data } = post;
    title = data.title;
    description = data.description || "";
    date = data.date;
    author = data.author?.name || "";
    tags = data.tags || [];
  }

  let fonts: Awaited<ReturnType<typeof loadOgFonts>> = [];
  try {
    fonts = await loadOgFonts();
  } catch {
    // Fall back to system fonts if Google Fonts is unreachable
  }

  return new ImageResponse(
    <OgContainer>
      <OgHeader label="Blog" />

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
    </OgContainer>,
    {
      width: 1200,
      height: 630,
      fonts,
    }
  );
}
