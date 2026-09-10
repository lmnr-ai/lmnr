import { Tailwind } from "@react-email/tailwind";
import type { ReactNode } from "react";

// Email HTML cannot depend on app CSS variables, so resolve brand tokens here.
// Keep these values aligned with the primary ramp in app/globals.css.
const EMAIL_TAILWIND_CONFIG = {
  theme: {
    extend: {
      colors: {
        "email-primary": "#df9067",
        "email-primary-300": "#d57e57",
      },
    },
  },
};

export function EmailTailwind({ children }: { children: ReactNode }) {
  return <Tailwind config={EMAIL_TAILWIND_CONFIG}>{children}</Tailwind>;
}
