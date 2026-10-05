import { type ReactNode } from "react";

import { resolveCompanyName } from "@/lib/actions/onboarding/company-name";

interface AwaitCompanyNameProps {
  domain: string;
  children: (companyName: string | null) => ReactNode;
}

// Server Component: suspends inside the page's <Suspense> while the first lookup for a domain runs.
export default async function AwaitCompanyName({ domain, children }: AwaitCompanyNameProps) {
  return children(await resolveCompanyName(domain));
}
