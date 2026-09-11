import { Text } from "@react-email/components";
import type { ReactNode } from "react";

import { defaultEmailTheme, type EmailTheme } from "../theme";

export function EmailParagraph({
  children,
  first = false,
  theme = defaultEmailTheme,
}: {
  children: ReactNode;
  first?: boolean;
  theme?: EmailTheme;
}) {
  return (
    <Text style={{ margin: `${first ? 0 : 16}px 0 0`, color: theme.foreground, fontSize: "14px", lineHeight: "22px" }}>
      {children}
    </Text>
  );
}
