"use client";
import { html } from "@codemirror/lang-html";
import { json } from "@codemirror/lang-json";
import { python } from "@codemirror/lang-python";
import { yaml } from "@codemirror/lang-yaml";
import { EditorView } from "@codemirror/view";
import { githubDarkStyle } from "@uiw/codemirror-theme-github";
import { createTheme } from "@uiw/codemirror-themes";
import YAML from "yaml";

export const theme = createTheme({
  theme: "dark",
  settings: {
    fontSize: "11pt",
    background: "transparent",
    lineHighlight: "transparent",
    gutterBackground: "#1D1D20",
    gutterBorder: "transparent",
    gutterForeground: "gray !important",
    selection: "#193860",
    selectionMatch: "transparent",
    caret: "2px solid hsl(var(--primary) / 0.1)",
  },
  styles: githubDarkStyle,
});

export const MAX_LINE_WRAPPING_LENGTH = 500000;
export const baseExtensions = [
  EditorView.theme({
    "&.cm-focused": {
      outline: "none !important",
    },
    "&": {
      fontSize: "10pt !important",
    },
    "&.cm-editor": {
      flex: 1,
      height: "100%",
      width: "100%",
      position: "relative",
    },
    "&.cm-scroller": {
      position: "absolute !important",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      overflow: "auto",
    },
  }),
];

export const languageExtensions = {
  python: () => python(),
  json: () => json(),
  yaml: () => yaml(),
  html: () => html(),
};

export const modes = ["TEXT", "YAML", "JSON"];
export const renderText = (mode: string, value: string) => {
  if (mode === "yaml") {
    try {
      return YAML.stringify(YAML.parse(value));
    } catch (e) {
      return value;
    }
  } else if (mode === "json") {
    try {
      if (JSON.parse(value) === value) {
        return value;
      }
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch (e) {
      return value;
    }
  }

  return value;
};
