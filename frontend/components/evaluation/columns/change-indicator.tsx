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
        <span className="text-green-300">&#x25B2;</span>
      ) : (
        <span className="text-destructive-text">&#x25BC;</span>
      )}
      <span className={originalValue >= comparisonValue ? "text-green-300" : "text-destructive-text"}>
        ({calculatePercentageChange(originalValue, comparisonValue)}%)
      </span>
    </span>
  </div>
);
