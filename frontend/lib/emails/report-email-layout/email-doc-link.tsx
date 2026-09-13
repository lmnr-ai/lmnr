import { Link } from "@react-email/components";
import type { ReactNode } from "react";

export function EmailDocLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-email-primary-300 no-underline">
      {children}
    </Link>
  );
}
