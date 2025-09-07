import { useEffect, useRef } from "react";

export function useSearchHighlight(searchTerm: string, isLoading: boolean, spanId?: string) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!searchTerm || isLoading || !containerRef.current) {
      return;
    }

    const highlightAndScroll = () => {
      if (!containerRef.current) return;

      const container = containerRef.current;

      const removeHighlights = () => {
        container.querySelectorAll(".search-highlight").forEach((highlight) => {
          const parent = highlight.parentNode;
          if (parent) {
            parent.replaceChild(document.createTextNode(highlight.textContent || ""), highlight);
            parent.normalize();
          }
        });
      };

      removeHighlights();

      const escapedSearchText = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(${escapedSearchText})`, "gi");

      // Find and highlight text nodes
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (!parent || parent.tagName === "SCRIPT" || parent.tagName === "STYLE") {
            return NodeFilter.FILTER_REJECT;
          }
          if (parent.closest(".search-highlight")) {
            return NodeFilter.FILTER_REJECT;
          }
          return node.textContent && node.textContent.trim().length > 0
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        },
      });

      const textNodes: Text[] = [];
      let node: Text | null;
      while ((node = walker.nextNode() as Text)) {
        if (regex.test(node.textContent || "")) {
          textNodes.push(node);
        }
      }

      // Apply highlights
      textNodes.forEach((textNode) => {
        const parent = textNode.parentNode;
        if (parent) {
          const wrapper = document.createElement("span");
          wrapper.innerHTML = (textNode.textContent || "").replace(regex, '<span class="search-highlight">$1</span>');
          parent.replaceChild(wrapper, textNode);
        }
      });

      // Scroll to first highlight
      const firstHighlight = container.querySelector(".search-highlight");
      if (firstHighlight) {
        firstHighlight.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest",
        });
      }
    };

    highlightAndScroll();

    return () => {
      // Clean up highlights on unmount
      if (containerRef.current) {
        containerRef.current.querySelectorAll(".search-highlight").forEach((highlight) => {
          const parent = highlight.parentNode;
          if (parent) {
            parent.replaceChild(document.createTextNode(highlight.textContent || ""), highlight);
            parent.normalize();
          }
        });
      }
    };
  }, [searchTerm, isLoading, spanId, containerRef.current]);

  return containerRef;
}
