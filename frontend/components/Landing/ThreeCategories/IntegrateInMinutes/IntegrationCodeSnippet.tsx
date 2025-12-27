"use client";

import { useState, useEffect } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { javascript } from "@codemirror/lang-javascript";
import { EditorView } from "@codemirror/view";
import { createTheme } from "@uiw/codemirror-themes";
import { tags as t } from "@lezer/highlight";
import { cn } from "@/lib/utils";
import LanguageButton from "./LanguageButton";
import LogoButton from "../../LogoButton";
import { integrations, type Integration } from "./snippets";

// Import logos for LogoButton components
import browserUse from "@/assets/landing/logos/browser-use.svg";
import vercel from "@/assets/landing/logos/vercel.svg";
import langgraph from "@/assets/landing/logos/langgraph.svg";
import lightLlm from "@/assets/landing/logos/light-llm.svg";

// Create a dark theme for CodeMirror
const darkTheme = createTheme({
  theme: "dark",
  settings: {
    background: "rgb(22 22 23)", // landing-surface-700
    foreground: "rgb(195 196 200)", // landing-text-200
    caret: "rgb(208 117 78)", // landing-primary-400
    selection: "rgb(208 117 78 / 0.3)",
    lineHighlight: "rgb(37 37 38)", // landing-surface-500
    gutterBackground: "rgb(22 22 23)", // landing-surface-700
    gutterForeground: "rgb(124 126 133)", // landing-text-400
    gutterBorder: "transparent",
  },
  styles: [
    { tag: t.comment, color: "rgb(124 126 133)" }, // landing-text-400
    { tag: t.string, color: "rgb(195 196 200)" }, // landing-text-200
    { tag: t.keyword, color: "rgb(208 117 78)" }, // landing-primary-400
    { tag: t.function(t.variableName), color: "rgb(255 255 255)" }, // landing-text-100
    { tag: t.number, color: "rgb(208 117 78)" }, // landing-primary-400
  ],
});

const readOnlyExtensions = [EditorView.editable.of(false), EditorView.lineWrapping];

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
      <div className="flex flex-col flex-1 rounded-[8px] overflow-hidden h-full">
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
          {availableLanguages.length > 1 && (
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
          )}
        </div>

        {/* CodeMirror */}
        <div className="bg-landing-surface-700 overflow-hidden flex-1">
          <CodeMirror
            value={code || ""}
            theme={darkTheme}
            extensions={[languageExtension, ...readOnlyExtensions]}
            editable={false}
            basicSetup={false}
          />
        </div>
      </div>

      {/* Screenshot container */}
      <div className="bg-landing-surface-700 flex-1 rounded-sm h-full" />
    </div>
  );
};

export default IntegrationCodeSnippet;
