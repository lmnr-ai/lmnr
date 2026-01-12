"use client";

import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { EditorView, lineNumbers } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { createTheme } from "@uiw/codemirror-themes";
import CodeMirror from "@uiw/react-codemirror";
import { useEffect, useState } from "react";
import LogoButton from "../../LogoButton";
import LanguageButton from "./LanguageButton";
import { integrations, type Integration } from "./snippets";

// Import logos for LogoButton components
import browserUse from "@/assets/landing/logos/browser-use.svg";
import langgraph from "@/assets/landing/logos/langgraph.svg";
import lightLlm from "@/assets/landing/logos/light-llm.svg";
import vercel from "@/assets/landing/logos/vercel.svg";

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
    gutterForeground: "rgb(124 126 133)", // landing-text-400
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
  className?: string;
}

const IntegrationCodeSnippet = ({ className }: Props) => {
  const [selectedIntegration, setSelectedIntegration] = useState<Integration>("browser-use");
  const [selectedLanguage, setSelectedLanguage] = useState<"typescript" | "python">("typescript");

  const currentIntegration = integrations[selectedIntegration];
  const availableLanguages: ("typescript" | "python")[] = [];
  if (currentIntegration.typescript) availableLanguages.push("typescript");
  if (currentIntegration.python) availableLanguages.push("python");

  // Auto-select first available language if current selection is not available
  useEffect(() => {
    const hasTypeScript = !!currentIntegration.typescript;
    const hasPython = !!currentIntegration.python;
    const available = [];
    if (hasTypeScript) available.push("typescript");
    if (hasPython) available.push("python");

    if (available.length > 0 && !available.includes(selectedLanguage)) {
      setSelectedLanguage(available[0] as "typescript" | "python");
    }
  }, [selectedIntegration, currentIntegration.typescript, currentIntegration.python, selectedLanguage]);

  const currentLanguage = availableLanguages.includes(selectedLanguage)
    ? selectedLanguage
    : availableLanguages[0] || "typescript";

  const code = currentLanguage === "typescript" ? currentIntegration.typescript : currentIntegration.python;
  const languageExtension = currentLanguage === "typescript" ? javascript({ jsx: true }) : python();

  return (
    <div className="flex gap-4 items-stretch w-full h-[400px]">
      <div className="flex flex-col flex-1 rounded-[8px] overflow-hidden h-full ">
        <div className="flex justify-between bg-landing-surface-600 p-[4px] pr-[16px]">
          {/* Logo buttons - 4 way toggle */}
          <div className="flex gap-[4px] items-center">
            <LogoButton
              logoSrc={browserUse}
              alt="Browser Use"
              size="sm"
              isActive={selectedIntegration === "browser-use"}
              onClick={() => setSelectedIntegration("browser-use")}
            />
            <LogoButton
              logoSrc={vercel}
              alt="Vercel"
              size="sm"
              isActive={selectedIntegration === "vercel"}
              onClick={() => setSelectedIntegration("vercel")}
            />
            <LogoButton
              logoSrc={langgraph}
              alt="LangGraph"
              size="sm"
              isActive={selectedIntegration === "langgraph"}
              onClick={() => setSelectedIntegration("langgraph")}
            />
            <LogoButton
              logoSrc={lightLlm}
              size="sm"
              alt="Light LLM"
              isActive={selectedIntegration === "light-llm"}
              onClick={() => setSelectedIntegration("light-llm")}
            />
          </div>

          {/* Language buttons */}
          <div className="flex gap-2 items-center">
            {availableLanguages.map((lang) => (
              <LanguageButton
                key={lang}
                language={lang}
                isActive={currentLanguage === lang}
                onClick={() => setSelectedLanguage(lang)}
              />
            ))}
          </div>
        </div>

        {/* CodeMirror */}
        <div className="bg-landing-surface-700 overflow-auto flex-1 min-h-0" data-lenis-prevent>
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
      <div className="bg-landing-surface-700 flex-1 rounded-sm h-full" />
    </div>
  );
};

export default IntegrationCodeSnippet;
