import { type InputHTMLAttributes, useCallback, useLayoutEffect, useRef } from "react";

import { measureTextWidth } from "@/lib/measure-text-width";

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

function resizeInput(input: HTMLInputElement): void {
  const computedStyles = getComputedStyle(input);
  const contentWidth = measureTextWidth(input.value || input.placeholder || "", computedStyles);
  const paddingLeft = parseInt(computedStyles.paddingLeft || "0", 10);
  const paddingRight = parseInt(computedStyles.paddingRight || "0", 10);
  const borderWidth = parseInt(computedStyles.borderWidth || "0", 10);

  // Add small buffer to prevent text clipping
  const buffer = 2;
  const totalWidth = contentWidth + paddingLeft + paddingRight + borderWidth * 2 + buffer;
  input.style.width = `${totalWidth}px`;
}
