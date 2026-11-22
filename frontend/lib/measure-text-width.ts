/**
 * Rendered width of `text` in `styles`' font, measured with an off-screen element so it honours
 * everything the browser applies (weight, letter spacing, tabular figures). `fontSize` overrides
 * the reference size.
 */
export function measureTextWidth(text: string, styles: CSSStyleDeclaration, fontSize = styles.fontSize): number {
  const div = document.createElement("div");

  // Position off-screen and hide from view/interaction
  div.style.position = "fixed";
  div.style.top = "0";
  div.style.left = "0";
  div.style.visibility = "hidden";
  div.style.pointerEvents = "none";
  div.style.zIndex = "-1";

  // Copy all text-related styles from the reference element
  div.style.fontSize = fontSize;
  div.style.fontWeight = styles.fontWeight;
  div.style.fontFamily = styles.fontFamily;
  div.style.letterSpacing = styles.letterSpacing;
  div.style.fontStyle = styles.fontStyle;
  div.style.fontVariant = styles.fontVariant;
  div.style.fontVariantNumeric = styles.fontVariantNumeric;
  div.style.textTransform = styles.textTransform;
  div.style.textRendering = styles.textRendering;

  // Make the div fit its content exactly
  div.style.whiteSpace = "pre";
  div.style.width = "auto";
  div.style.height = "auto";
  div.style.display = "inline-block";

  div.textContent = text;
  document.body.appendChild(div);
  const width = div.getBoundingClientRect().width;
  document.body.removeChild(div);
  return width;
}
