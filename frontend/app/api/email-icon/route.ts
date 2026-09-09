// Rasterizes the lucide icons used in the Signals Report email to PNG.
// Gmail does not render SVG at all (caniemail image-svg / html-svg = "n"), so
// every icon must ship as a raster. The Rust sender will do the same thing with
// `resvg` and attach the result as a CID part; this route is the preview twin.
import { type NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

const PATHS: Record<string, string> = {
  box: "M2.2 4.66667L8 8M8 8L13.8 4.66667M8 8L8 14.6667M14 5.33333C13.9998 5.09952 13.938 4.86987 13.821 4.66744C13.704 4.46501 13.5358 4.29691 13.3333 4.18L8.66667 1.51333C8.46397 1.39631 8.23405 1.3347 8 1.3347C7.76595 1.3347 7.53603 1.39631 7.33333 1.51333L2.66667 4.18C2.46418 4.29691 2.29599 4.46501 2.17897 4.66744C2.06196 4.86987 2.00024 5.09952 2 5.33333V10.6667C2.00024 10.9005 2.06196 11.1301 2.17897 11.3326C2.29599 11.535 2.46418 11.7031 2.66667 11.82L7.33333 14.4867C7.53603 14.6037 7.76595 14.6653 8 14.6653C8.23405 14.6653 8.46397 14.6037 8.66667 14.4867L13.3333 11.82C13.5358 11.7031 13.704 11.535 13.821 11.3326C13.938 11.1301 13.9998 10.9005 14 10.6667V5.33333Z",
  "arrow-up-right": "M5.83333 4.66667H11.3333M11.3333 4.66667V10.1667M11.3333 4.66667L4.66667 11.3333",
};

// Emails are viewed on 2x/3x displays; render at 3x and constrain with width/height.
const SCALE = 3;

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const icon = params.get("icon") ?? "box";
    const raw = params.get("color") ?? "#000000";

    const d = PATHS[icon];
    if (!d) return NextResponse.json({ error: `Unknown icon: ${icon}` }, { status: 400 });
    if (!/^#[0-9a-fA-F]{6}$/.test(raw)) {
      return NextResponse.json({ error: "color must be #rrggbb" }, { status: 400 });
    }

    const size = 16 * SCALE;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 16 16" fill="none"><path d="${d}" stroke="${raw}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    return new NextResponse(new Uint8Array(png), {
      headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" },
    });
  } catch {
    return NextResponse.json({ error: "Failed to render icon" }, { status: 500 });
  }
}
