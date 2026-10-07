import type { CSSProperties } from "react";

/** Tunable knobs for every transactional email. The /email-notifications
 *  workspace drives these live via DialKit; production sends use the defaults. */
export interface EmailTheme {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  headingSize: number;
  headingWeight: number;
  containerWidth: number;
  containerPadding: number;
  blockSpacing: number;
  background: string;
  foreground: string;
  mutedForeground: string;
  accent: string;
  buttonBackground: string;
  buttonForeground: string;
  buttonRadius: number;
  buttonPaddingY: number;
  buttonPaddingX: number;
}

export const defaultEmailTheme: EmailTheme = {
  fontFamily: "'Inter', 'Roboto', 'Helvetica', sans-serif",
  fontSize: 15,
  lineHeight: 22,
  headingSize: 24,
  headingWeight: 600,
  containerWidth: 500,
  containerPadding: 20,
  blockSpacing: 24,
  background: "#ffffff",
  foreground: "#111827",
  mutedForeground: "#6b7280",
  accent: "#2563eb",
  buttonBackground: "#111827",
  buttonForeground: "#ffffff",
  buttonRadius: 6,
  buttonPaddingY: 10,
  buttonPaddingX: 20,
};

export interface EmailStyles {
  body: CSSProperties;
  container: CSSProperties;
  text: CSSProperties;
  heading: CSSProperties;
  link: CSSProperties;
  button: CSSProperties;
  label: CSSProperties;
  value: CSSProperties;
  signature: CSSProperties;
  muted: CSSProperties;
  bulletList: CSSProperties;
  bulletPoint: CSSProperties;
}

export function buildEmailStyles(theme: EmailTheme = defaultEmailTheme): EmailStyles {
  const text: CSSProperties = {
    fontFamily: theme.fontFamily,
    fontSize: `${theme.fontSize}px`,
    fontWeight: 400,
    lineHeight: `${theme.lineHeight}px`,
    color: theme.foreground,
  };

  return {
    body: { backgroundColor: theme.background, margin: 0 },
    container: {
      margin: "0 auto",
      padding: `${theme.containerPadding}px`,
      maxWidth: `${theme.containerWidth}px`,
      backgroundColor: theme.background,
    },
    text,
    heading: {
      ...text,
      fontSize: `${theme.headingSize}px`,
      fontWeight: theme.headingWeight,
      marginBottom: `${theme.blockSpacing}px`,
    },
    link: { color: theme.accent, textDecoration: "none" },
    button: {
      display: "inline-block",
      marginTop: `${theme.blockSpacing / 1.5}px`,
      padding: `${theme.buttonPaddingY}px ${theme.buttonPaddingX}px`,
      backgroundColor: theme.buttonBackground,
      color: theme.buttonForeground,
      borderRadius: `${theme.buttonRadius}px`,
      fontFamily: theme.fontFamily,
      fontSize: `${Math.max(12, theme.fontSize - 1)}px`,
      fontWeight: 600,
      textDecoration: "none",
      textAlign: "center",
    },
    label: { ...text, fontWeight: 600, marginBottom: "0px" },
    value: { ...text, marginTop: "0px" },
    signature: { ...text, marginTop: `${theme.blockSpacing}px`, fontWeight: 500 },
    muted: { ...text, color: theme.mutedForeground, fontSize: `${Math.max(10, theme.fontSize - 3)}px` },
    bulletList: { marginLeft: "20px", marginBottom: "16px" },
    bulletPoint: { ...text, marginBottom: "8px" },
  };
}

/** Light/dark presets for the preview workspace toggle. */
export const emailThemePresets: Record<"light" | "dark", Partial<EmailTheme>> = {
  light: {
    background: "#ffffff",
    foreground: "#111827",
    mutedForeground: "#6b7280",
    accent: "#2563eb",
    buttonBackground: "#111827",
    buttonForeground: "#ffffff",
  },
  dark: {
    background: "#0b0b0c",
    foreground: "#ededee",
    mutedForeground: "#9ca3af",
    accent: "#7aa2f7",
    buttonBackground: "#ededee",
    buttonForeground: "#0b0b0c",
  },
};
