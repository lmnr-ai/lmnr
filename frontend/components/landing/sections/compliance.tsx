import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { subSection } from "../class-names";

interface CardProps {
  title: string;
  description: string;
  href: string;
}

// Same shell as ./features-for-every-step — surface, height, padding, radius and
// hover are deliberately identical so the two grids read as one family. Two
// differences: there is no icon, so the title takes the top row beside the
// arrow, and the description sits alone at the bottom. Keep the shell classes in
// sync with that file.
const Card = ({ title, description, href }: CardProps) => (
  <Link
    target="_blank"
    aria-label={`Learn more about ${title}`}
    href={href}
    className="bg-surface-500 font-sans-landing flex flex-col h-[180px] px-5 py-4 justify-between rounded transition-all duration-300 hover:bg-surface-200"
  >
    <div className="flex items-start justify-between gap-3 w-full">
      <p className="leading-6 text-white text-lg">{title}</p>
      <ArrowUpRight className="size-5 shrink-0 text-foreground-300" strokeWidth={1.5} />
    </div>
    <p className="text-foreground-200">{description}</p>
  </Link>
);

const Compliance = () => (
  <section className="flex flex-col items-start gap-[52px] w-full">
    <h2 className={subSection}>Enterprise-ready</h2>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
      <Card
        title="PII redaction at scale"
        description="Laminar redacts sensitive information from every span on Laminar's own infrastructure before storage."
        href="https://laminar.sh/docs/platform/pii-redaction"
      />
      <Card
        title="Deploy on AWS or GCP with Helm"
        description="Run Laminar on Kubernetes with the Laminar Helm chart."
        href="https://laminar.sh/docs/hosting-options#hosting-options"
      />
      <Card
        title="Open Source"
        description="Apache 2.0 licensed"
        href="https://github.com/lmnr-ai/lmnr?tab=Apache-2.0-1-ov-file#readme"
      />
      <Card title="HIPAA & SOC 2 Type II Compliant" description="Compliance" href="https://compliance.laminar.sh/" />
    </div>
  </section>
);

export default Compliance;
