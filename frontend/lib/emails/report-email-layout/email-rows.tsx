import { Section } from "@react-email/components";

import { defaultEmailTheme, type EmailTheme } from "../theme";

export function EmailRows({ rows, theme = defaultEmailTheme }: { rows: Array<[string, string]>; theme?: EmailTheme }) {
  return (
    <Section style={{ marginTop: "20px" }}>
      {rows.map(([label, value]) => (
        <table
          key={label}
          width="100%"
          cellPadding="0"
          cellSpacing="0"
          role="presentation"
          style={{ marginBottom: "4px", borderRadius: "4px", backgroundColor: "#fafafa" }}
        >
          <tbody>
            <tr>
              <td style={{ padding: "7px 10px", color: theme.mutedForeground, fontSize: "14px" }}>{label}</td>
              <td align="right" style={{ padding: "7px 10px", color: theme.foreground, fontSize: "14px" }}>
                {value}
              </td>
            </tr>
          </tbody>
        </table>
      ))}
    </Section>
  );
}
