import DOMPurify from "dompurify";
import Handlebars from "handlebars";
import { useEffect, useRef } from "react";

const HtmlRenderer = ({ code, data }: { code: string; data: any }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    try {
      let parsedData;
      try {
        parsedData = typeof data === "string" ? JSON.parse(data) : data;
      } catch (e) {
        parsedData = data;
      }

      const template = Handlebars.compile(code);
      const html = template(parsedData);

      container.innerHTML = DOMPurify.sanitize(html);
    } catch (error) {
      container.innerHTML = `
        <div style="color: #dc2626; background: #fef2f2; padding: 16px; border-radius: 6px; border: 1px solid #fecaca;">
          Error: ${error instanceof Error ? error.message : JSON.stringify(error)}
        </div>
      `;
    }
  }, [code, data]);

  return (
    <div
      ref={containerRef}
      className="w-full min-h-[400px] h-full border border-gray-200 bg-white p-4 overflow-auto"
      style={{
        contain: "layout style",
        isolation: "isolate",
      }}
    />
  );
};

export default HtmlRenderer;
