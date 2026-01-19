"use client";

import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import CodeMirror from "@uiw/react-codemirror";
import Image from "next/image";
import { useMemo } from "react";

import { cn } from "@/lib/utils";

import { baseExtensions, createLineHighlightPlugin, darkTheme } from "./codemirror-config";
import { type Integration, integrations } from "./snippets";

const screenshots: { integration: Integration; src: string }[] = [
  { integration: "vercel", src: "/assets/landing/snippet-screenshots/vercel-ai-sdk.png" },
  { integration: "light-llm", src: "/assets/landing/snippet-screenshots/lite-llm.png" },
  { integration: "browser-use", src: "/assets/landing/snippet-screenshots/browser-use.png" },
  { integration: "claude", src: "/assets/landing/snippet-screenshots/claude-agent-sdk.png" },
  { integration: "langgraph", src: "/assets/landing/snippet-screenshots/lang-chain.png" },
  { integration: "open-hands", src: "/assets/landing/snippet-screenshots/open-hands.png" },
];

interface Props {
  selectedIntegration: Integration;
}

const IntegrationCodeSnippet = ({ selectedIntegration }: Props) => {
  const currentIntegration = integrations[selectedIntegration];

  // Use typescript if available, otherwise python
  const useTypeScript = !!currentIntegration.typescript;
  const code = useTypeScript ? currentIntegration.typescript : currentIntegration.python;
  const languageExtension = useTypeScript ? javascript({ jsx: true }) : python();

  const extensions = useMemo(
    () => [languageExtension, ...baseExtensions, createLineHighlightPlugin(currentIntegration.highlightedLines)],
    [languageExtension, currentIntegration.highlightedLines]
  );

  return (
    <div className={cn("flex gap-4 items-stretch w-full md:h-[400px] md:flex-row", "flex-col h-[750px]")}>
      <div className="flex flex-col flex-1 rounded-[8px] overflow-hidden h-full">
        {/* CodeMirror */}
        <div
          className={cn(
            "bg-landing-surface-700 overflow-auto flex-1 min-h-0 border border-landing-surface-500",
            "[&_.cm-editor]:md:text-sm [&_.cm-editor]:text-xs [&_.cm-content]:md:py-3 [&_.cm-content]:py-2 [&_.cm-line]:md:px-4 [&_.cm-line]:px-3"
          )}
        >
          <CodeMirror
            value={code || ""}
            theme={darkTheme}
            extensions={extensions}
            editable={false}
            basicSetup={false}
            className="h-full"
          />
        </div>
      </div>

      {/* Screenshot container */}
      <div className="bg-landing-surface-700 flex-1 rounded-[8px] h-full overflow-hidden relative border border-landing-surface-500">
        <div
          className="flex transition-transform duration-500 ease-in-out h-full"
          // NOTE: THIS 16.67...
          style={{
            transform: `translateX(-${screenshots.findIndex((s) => s.integration === selectedIntegration) * (100 / screenshots.length)}%)`,
          }}
        >
          {screenshots.map(({ integration, src }) => (
            <div
              key={integration}
              // NOTE: AND THIS 83.33 need to add to 100
              className={cn(
                "min-w-full h-full relative transition-opacity duration-500",
                integration === selectedIntegration ? "opacity-100" : "opacity-0"
              )}
              style={{ marginRight: `-${100 - 100 / screenshots.length}%` }}
            >
              <div className="absolute top-[30px] left-[40px] w-[110%] h-[110%]">
                <Image
                  src={src}
                  alt={`${integration} screenshot`}
                  fill
                  priority
                  className="object-cover object-top-left rounded-sm outline outline-landing-surface-500 contrast-[0.84]"
                />
              </div>
            </div>
          ))}
        </div>
        <div className="bg-gradient-to-t w-full h-[40%] from-landing-surface-700/100 to-landing-surface-700/0 absolute bottom-0 left-0 z-10" />
      </div>
    </div>
  );
};

export default IntegrationCodeSnippet;
