type HastNode = { children?: { type?: string; tagName?: string }[] };

/**
 * Streamdown renders an image as a block wrapper (image + hover overlay + download button), so a markdown paragraph
 * holding an image must not be a `<p>`: a `<div>` inside `<p>` is invalid HTML and breaks hydration.
 */
export const paragraphTag = (node: unknown): "p" | "div" =>
  (node as HastNode | undefined)?.children?.some((c) => c.type === "element" && c.tagName === "img") ? "div" : "p";
