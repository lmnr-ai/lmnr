import { calculatePercentageChange } from "@/components/evaluation/utils";

export const ChangeIndicator = ({
  originalValue,
  comparisonValue,
}: {
  originalValue: number;
  comparisonValue: number;
}) => (
  <div className="shrink-0 ml-1">
    <span className="text-xs">
      {originalValue >= comparisonValue ? (
        <span className="text-success-bright">&#x25B2;</span>
      ) : (
        <span className="text-destructive">&#x25BC;</span>
      )}
      <span className={originalValue >= comparisonValue ? "text-success-bright" : "text-destructive"}>
        ({calculatePercentageChange(originalValue, comparisonValue)}%)
      </span>
    </span>
  </div>
);
