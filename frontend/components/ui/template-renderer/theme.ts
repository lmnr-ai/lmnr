/**
 * Laminar design tokens that are injected into the JSX renderer's twind config
 * so user/AI-generated templates can use the same semantic class names as the rest
 * of the platform (e.g. `bg-background`, `text-primary`, `border-border`).
 *
 * These values MUST stay in sync with the HSL definitions in `frontend/app/globals.css`
 * (the `:root` block in particular). When you change a token in globals.css, mirror it
 * here as a hex literal — the iframe runs twind from a CDN without access to our CSS
 * variables, so it needs concrete color values.
 *
 * Naming follows shadcn/Tailwind semantic conventions: each token has an optional
 * `*-foreground` companion for the contrast text used on top of that surface.
 */
export const LAMINAR_IFRAME_THEME = {
  colors: {
    background: "#0A0A0A",
    foreground: "#E6E2E2",

    card: { DEFAULT: "#121212", foreground: "#CACACE" },
    popover: { DEFAULT: "#141414", foreground: "#E6E2E2" },

    primary: { DEFAULT: "#CB7B4F", foreground: "#E8E8E8" },
    secondary: { DEFAULT: "#121212", foreground: "#B5B5B5" },

    muted: { DEFAULT: "#22232A", foreground: "#858585" },
    accent: { DEFAULT: "#27282F", foreground: "#FFFFFF" },

    border: "#2B2C36",
    input: "#2B2C36",
    ring: "#9CC3F5",

    destructive: { DEFAULT: "#CC3333", foreground: "#F8FAFC" },
    "destructive-bright": "#E15454",
    success: { DEFAULT: "#16A34A", foreground: "#F0FDF4" },
    "success-bright": "#34D399",

    tool: "#E5A209",
    llm: { DEFAULT: "#8B5CF6", foreground: "#BC92F8" },
    subagent: "#0EB7D6",
  },
  fontFamily: {
    sans: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "Inter", "sans-serif"],
    mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
  },
} as const;

/** Serialized form of {@link LAMINAR_IFRAME_THEME} for embedding into the iframe srcdoc. */
export const laminarIframeThemeJson = (): string => JSON.stringify(LAMINAR_IFRAME_THEME);
