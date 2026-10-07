import { Text } from "@react-email/components";
import type { ReactNode } from "react";

import { defaultEmailTheme, type EmailTheme } from "../theme";

export function EmailFooter({ children, theme = defaultEmailTheme }: { children: ReactNode; theme?: EmailTheme }) {
  return (
    <Text style={{ margin: "16px 0 0", color: theme.mutedForeground, fontSize: "12px", lineHeight: "18px" }}>
      {children}
    </Text>
  );
}
