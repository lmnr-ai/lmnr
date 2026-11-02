import { useEffect, useRef, useState } from "react";

// Ratio that shrinks content of `contentWidth` to fit the observed element; 1 once it fits.
export function useFitScale<T extends HTMLElement>(contentWidth: number) {
  const ref = useRef<T>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setScale(Math.min(1, entry.contentRect.width / contentWidth));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [contentWidth]);

  return { ref, scale };
}
