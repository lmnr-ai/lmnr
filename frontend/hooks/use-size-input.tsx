import { type InputHTMLAttributes, useCallback, useLayoutEffect, useRef } from "react";

export function useSizeInput(value?: InputHTMLAttributes<HTMLInputElement>["value"]) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useLayoutEffect(() => {
    if (inputRef.current) {
      resizeInput(inputRef.current);
    }
  }, [value]);

  const handleInputChange = useCallback(() => {
    if (inputRef.current) {
      resizeInput(inputRef.current);
    }
  }, []);

  return useCallback(
    (element: HTMLInputElement | null) => {
      if (inputRef.current) {
        inputRef.current.removeEventListener("input", handleInputChange);
      }

      if (element) {
        resizeInput(element);
        element.addEventListener("input", handleInputChange);
      }

      inputRef.current = element;
    },
    [handleInputChange]
  );
}

function createMeasurementDiv(referenceStyles: CSSStyleDeclaration): HTMLDivElement {
  const div = document.createElement("div");

  div.style.position = "fixed";
  div.style.top = "0";
  div.style.left = "0";
  div.style.visibility = "hidden";
  div.style.pointerEvents = "none";
  div.style.zIndex = "-1";

  div.style.fontSize = referenceStyles.fontSize;
  div.style.fontWeight = referenceStyles.fontWeight;
  div.style.fontFamily = referenceStyles.fontFamily;
  div.style.letterSpacing = referenceStyles.letterSpacing;
  div.style.fontStyle = referenceStyles.fontStyle;
  div.style.fontVariant = referenceStyles.fontVariant;
  div.style.textTransform = referenceStyles.textTransform;

  div.style.textRendering = referenceStyles.textRendering;

  div.style.whiteSpace = "pre";
  div.style.width = "auto";
  div.style.height = "auto";
  div.style.display = "inline-block";

  return div;
}

function resizeInput(input: HTMLInputElement): void {
  const computedStyles = getComputedStyle(input);

  const measurementDiv = createMeasurementDiv(computedStyles);
  measurementDiv.textContent = input.value || input.placeholder || "";
  document.body.appendChild(measurementDiv);

  const contentWidth = measurementDiv.offsetWidth;
  const paddingLeft = parseInt(computedStyles.paddingLeft || "0", 10);
  const paddingRight = parseInt(computedStyles.paddingRight || "0", 10);
  const borderWidth = parseInt(computedStyles.borderWidth || "0", 10);

  const buffer = 2;
  const totalWidth = contentWidth + paddingLeft + paddingRight + borderWidth * 2 + buffer;

  document.body.removeChild(measurementDiv);
  input.style.width = `${totalWidth}px`;
}
