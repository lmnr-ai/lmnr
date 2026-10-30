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
