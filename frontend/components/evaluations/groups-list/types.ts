export type EvaluationGroup = {
  groupId: string;
  lastEvaluationCreatedAt: string;
  firstEvaluationCreatedAt: string;
  runCount: number;
};

export type GroupVariant = "list" | "cards" | "timeline" | "chips" | "bars";

export type VariantProps = {
  groups: EvaluationGroup[];
  selectedGroupId: string | null;
  onSelect: (groupId: string) => void;
};
