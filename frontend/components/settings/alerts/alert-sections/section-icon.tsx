import { type AlertType } from "@/lib/actions/alerts/types";

import { SECTION_META } from "./constants";

export default function SectionIcon({ type }: { type: AlertType }) {
  const Icon = SECTION_META[type].icon;
  return <Icon className="size-4 text-muted-foreground" />;
}
