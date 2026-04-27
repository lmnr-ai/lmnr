import type { NextRequest } from "next/server";

import { generatePostOgImage } from "@/lib/blog/og";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return generatePostOgImage(slug, "Blog");
}
