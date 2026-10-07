import { Button, Section } from "@react-email/components";
import type { ReactNode } from "react";

export function EmailAction({
  href,
  children,
  align = "center",
}: {
  href: string;
  children: ReactNode;
  align?: "left" | "center";
}) {
  return (
    <Section className={align === "left" ? "mt-5 text-left" : "mt-5 text-center"}>
      <Button href={href} className="rounded bg-email-primary px-4 py-2.5 text-sm font-normal text-white no-underline">
        {children}
      </Button>
    </Section>
  );
}
