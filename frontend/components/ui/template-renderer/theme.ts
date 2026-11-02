import { type AppTheme } from "@/lib/app-theme";

/**
 * Laminar design tokens injected into the JSX renderer's twind config so
 * user/AI-generated templates can use the same semantic class names as the rest
 * of the platform (e.g. `bg-background`, `text-primary-text`, `border-border`).
 *
 * The iframe runs twind from a CDN without our stylesheet, so each token is an
 * `r g b` channel triple resolved from `frontend/app/globals.css`. Mirror any
 * token change there into BOTH palettes here. Channels (not full colours) keep
 * opacity modifiers like `bg-primary/15` working through `<alpha-value>`.
 *
 * `card`, `popover`, `accent`, `input` and the `*-bright` names no longer exist
 * in the app; they stay here because saved templates use them.
 */
const PALETTES: Record<AppTheme, Record<string, string>> = {
  dark: {
    background: "8 8 8",
    foreground: "230 230 230",
    card: "18 18 18",
    popover: "28 28 28",
    accent: "38 38 38",
    primary: "208 117 78",
    "primary-foreground": "230 230 230",
    "primary-text": "208 117 78",
    secondary: "18 18 18",
    "secondary-foreground": "181 181 181",
    muted: "33 33 33",
    "muted-foreground": "133 133 133",
    border: "33 33 33",
    ring: "145 195 253",
    destructive: "226 80 80",
    "destructive-foreground": "248 250 252",
    "destructive-text": "226 80 80",
    success: "54 211 153",
    "success-foreground": "240 253 244",
    "success-text": "54 211 153",
    tool: "226 161 8",
    llm: "124 59 237",
    "llm-foreground": "193 122 255",
    subagent: "7 189 213",
    user: "96 165 250",
  },
  light: {
    background: "235 235 235",
    foreground: "28 29 32",
    card: "238 238 238",
    popover: "245 245 245",
    accent: "252 252 252",
    primary: "208 117 78",
    "primary-foreground": "255 255 255",
    "primary-text": "199 93 23",
    secondary: "238 238 238",
    "secondary-foreground": "55 56 59",
    muted: "248 248 248",
    "muted-foreground": "104 104 108",
    border: "222 222 222",
    ring: "195 94 50",
    destructive: "236 101 101",
    "destructive-foreground": "255 255 255",
    "destructive-text": "219 36 36",
    success: "55 190 145",
    "success-foreground": "255 255 255",
    "success-text": "41 142 109",
    tool: "170 111 9",
    llm: "99 34 211",
    "llm-foreground": "90 36 183",
    subagent: "16 128 142",
    user: "37 99 235",
  },
};

const tokenColor = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;
/** For the iframe's own CSS, where twind's `<alpha-value>` substitution doesn't run. */
export const tokenCss = (name: string, alpha = 1) => `rgb(var(--${name}) / ${alpha})`;

export const LAMINAR_IFRAME_THEME = {
  colors: {
    background: tokenColor("background"),
    foreground: tokenColor("foreground"),

    card: { DEFAULT: tokenColor("card"), foreground: tokenColor("foreground") },
    popover: { DEFAULT: tokenColor("popover"), foreground: tokenColor("foreground") },

    primary: {
      DEFAULT: tokenColor("primary"),
      foreground: tokenColor("primary-foreground"),
      text: tokenColor("primary-text"),
    },
    secondary: { DEFAULT: tokenColor("secondary"), foreground: tokenColor("secondary-foreground") },

    muted: { DEFAULT: tokenColor("muted"), foreground: tokenColor("muted-foreground") },
    accent: { DEFAULT: tokenColor("accent"), foreground: tokenColor("foreground") },

    border: tokenColor("border"),
    input: tokenColor("border"),
    ring: tokenColor("ring"),

    destructive: {
      DEFAULT: tokenColor("destructive"),
      foreground: tokenColor("destructive-foreground"),
      text: tokenColor("destructive-text"),
    },
    "destructive-bright": tokenColor("destructive-text"),
    success: {
      DEFAULT: tokenColor("success"),
      foreground: tokenColor("success-foreground"),
      text: tokenColor("success-text"),
    },
    "success-bright": tokenColor("success-text"),

    tool: tokenColor("tool"),
    llm: { DEFAULT: tokenColor("llm"), foreground: tokenColor("llm-foreground") },
    subagent: tokenColor("subagent"),
    user: tokenColor("user"),
  },
  fontFamily: {
    sans: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "Inter", "sans-serif"],
    mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
  },
} as const;

/** One block per theme, selected by `data-theme` on the iframe's `<html>`. */
export const laminarIframeThemeCss = (): string =>
  Object.entries(PALETTES)
    .map(([theme, vars]) => {
      const decls = Object.entries(vars)
        .map(([name, value]) => `--${name}: ${value};`)
        .join(" ");
      return `:root[data-theme="${theme}"] { color-scheme: ${theme}; ${decls} }`;
    })
    .join("\n");

/** Serialized form of {@link LAMINAR_IFRAME_THEME} for embedding into the iframe srcdoc. */
export const laminarIframeThemeJson = (): string => JSON.stringify(LAMINAR_IFRAME_THEME);
