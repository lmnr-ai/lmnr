import { MessageCircle } from "lucide-react";

import { MODEL_PILL_CLS } from "@/components/traces/model-indicator";

/** One pill per model the session used, most tokens first. */
export default function ModelPills({ models }: { models: { model: string }[] }) {
  return models.map(({ model }) => (
    <span key={model} className={MODEL_PILL_CLS}>
      <MessageCircle size={12} className="min-w-3" />
      <span className="truncate">{model}</span>
    </span>
  ));
}
