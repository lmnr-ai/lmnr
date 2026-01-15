import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { EditorView, lineNumbers } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { createTheme } from "@uiw/codemirror-themes";
import CodeMirror from "@uiw/react-codemirror";
import Image from "next/image";

import { cn } from "@/lib/utils";

import { type Integration, integrations } from "./snippets";

const screenshots: { integration: Integration; src: string }[] = [
  { integration: "browser-use", src: "/assets/landing/snippet-screenshots/browser-use.png" },
  { integration: "claude", src: "/assets/landing/snippet-screenshots/claude-agent-sdk.png" },
  { integration: "vercel", src: "/assets/landing/snippet-screenshots/vercel-ai-sdk.png" },
  { integration: "langgraph", src: "/assets/landing/snippet-screenshots/lang-chain.png" },
  { integration: "light-llm", src: "/assets/landing/snippet-screenshots/lite-llm.png" },
];

// Ayu-inspired dark theme with landing colors
const darkTheme = createTheme({
  theme: "dark",
  settings: {
    background: "rgb(22 22 23)", // landing-surface-700
    foreground: "#bfbdb6",
    caret: "rgb(208 117 78)", // landing-primary-400
    selection: "#273747",
    selectionMatch: "#273747",
    lineHighlight: "rgb(37 37 38)", // landing-surface-500
    gutterBackground: "rgb(22 22 23)", // landing-surface-700
    gutterForeground: "rgb(67 68 71)", // landing-text-600
    gutterBorder: "transparent",
  },
  styles: [
    { tag: t.comment, color: "#7C7E85", fontStyle: "italic" }, // Text color for comments
    { tag: t.string, color: "#a5c089" }, // Green for strings
    { tag: [t.keyword, t.operatorKeyword, t.modifier], color: "rgb(208 117 78)" }, // landing-primary-400 for keywords (vibrant)
    { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#c4b595" }, // Yellow for functions
    { tag: [t.className, t.typeName, t.namespace], color: "#94b4c9" }, // Cyan for types
    { tag: [t.variableName, t.definition(t.variableName)], color: "#bfbdb6" }, // Gray for variables
    { tag: [t.propertyName, t.attributeName], color: "#c4b595" }, // Yellow for properties
    { tag: t.number, color: "#c0adc9" }, // Purple for numbers
    { tag: [t.bool, t.null, t.atom], color: "rgb(208 117 78)" }, // landing-primary-400 for literals (vibrant)
    { tag: [t.operator, t.punctuation], color: "#b0a5a0" }, // Slightly saturated for operators
    { tag: [t.moduleKeyword, t.controlKeyword], color: "rgb(208 117 78)" }, // landing-primary-400 for control (vibrant)
    { tag: [t.special(t.variableName), t.self, t.constant(t.variableName)], color: "#b0a5a0" }, // Slightly saturated
    { tag: t.angleBracket, color: "#bfbdb6" }, // Text color for brackets
    { tag: t.tagName, color: "#94b4c9" }, // Cyan for tags
  ],
});

const readOnlyExtensions = [
  EditorView.editable.of(false),
  EditorView.lineWrapping,
  lineNumbers(),
  EditorView.theme({
    "&": {
      padding: "4px",
      height: "100%",
      overflow: "hidden",
    },
    ".cm-scroller": {
      overflow: "auto",
      height: "100%",
      maxHeight: "100%",
    },
  }),
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

  return (
    <div className="flex gap-4 items-stretch w-full h-[400px]">
      <div className="flex flex-col flex-1 rounded-[8px] overflow-hidden h-full">
        {/* CodeMirror */}
        <div className="bg-landing-surface-700 overflow-auto flex-1 min-h-0 border border-landing-surface-500">
          <CodeMirror
            value={code || ""}
            theme={darkTheme}
            extensions={[languageExtension, ...readOnlyExtensions]}
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
          // NOTE: THIS 20...
          style={{
            transform: `translateX(-${screenshots.findIndex((s) => s.integration === selectedIntegration) * 20}%)`,
          }}
        >
          {screenshots.map(({ integration, src }) => (
            <div
              key={integration}
              // NOTE: AND THIS 80 need to add to 100
              className={cn(
                "min-w-full h-full relative transition-opacity duration-500 mr-[-80%]",
                integration === selectedIntegration ? "opacity-100" : "opacity-0"
              )}
            >
              <div className="absolute top-[30px] left-[40px] w-[110%] h-[110%]">
                <Image
                  src={src}
                  alt={`${integration} screenshot`}
                  fill
                  priority
                  className="object-cover object-top rounded-sm outline outline-landing-surface-500 contrast-[0.84]"
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
