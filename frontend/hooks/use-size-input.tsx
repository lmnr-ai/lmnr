import { type InputHTMLAttributes, useCallback, useLayoutEffect, useRef } from "react";

// Hook that returns a ref callback to automatically resize an input based on its content.
export function useSizeInput(value?: InputHTMLAttributes<HTMLInputElement>["value"]) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Resize input whenever the value prop changes
  useLayoutEffect(() => {
    if (inputRef.current) {
      resizeInput(inputRef.current);
    }
  }, [value]);

  // Handler for input events to resize on user typing
  const handleInputChange = useCallback(() => {
    if (inputRef.current) {
      resizeInput(inputRef.current);
    }
  }, []);

  // Return a ref callback that sets up/cleans up event listeners
  return useCallback(
    (element: HTMLInputElement | null) => {
      // Clean up previous element's listener
      if (inputRef.current) {
        inputRef.current.removeEventListener("input", handleInputChange);
      }

      // Set up new element
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

  // Position off-screen and hide from view/interaction
  div.style.position = "fixed";
  div.style.top = "0";
  div.style.left = "0";
  div.style.visibility = "hidden";
  div.style.pointerEvents = "none";
  div.style.zIndex = "-1";

  // Copy all text-related styles from the input
  div.style.fontSize = referenceStyles.fontSize;
  div.style.fontWeight = referenceStyles.fontWeight;
  div.style.fontFamily = referenceStyles.fontFamily;
  div.style.letterSpacing = referenceStyles.letterSpacing;
  div.style.fontStyle = referenceStyles.fontStyle;
  div.style.fontVariant = referenceStyles.fontVariant;
  div.style.textTransform = referenceStyles.textTransform;

  div.style.textRendering = referenceStyles.textRendering;

  // Make the div fit its content exactly
  div.style.whiteSpace = "pre";
  div.style.width = "auto";
  div.style.height = "auto";
  div.style.display = "inline-block";

  return div;
}

function resizeInput(input: HTMLInputElement): void {
  const computedStyles = getComputedStyle(input);

  // Create a hidden div with the same text styles
  const measurementDiv = createMeasurementDiv(computedStyles);
  measurementDiv.textContent = input.value || input.placeholder || "";
  document.body.appendChild(measurementDiv);

  // Measure the actual content width
  const contentWidth = measurementDiv.offsetWidth;
  const paddingLeft = parseInt(computedStyles.paddingLeft || "0", 10);
  const paddingRight = parseInt(computedStyles.paddingRight || "0", 10);
  const borderWidth = parseInt(computedStyles.borderWidth || "0", 10);

  // Add small buffer to prevent text clipping
  const buffer = 2;
  const totalWidth = contentWidth + paddingLeft + paddingRight + borderWidth * 2 + buffer;

  // Clean up and apply the new width
  document.body.removeChild(measurementDiv);
  input.style.width = `${totalWidth}px`;
}
