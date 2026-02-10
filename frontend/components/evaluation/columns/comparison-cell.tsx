import { ArrowRight } from "lucide-react";

import {
  calculatePercentageChange,
  type DisplayValue,
  isValidScore,
} from "@/components/evaluation/utils";

import ComparisonIndicator from "../comparison-indicator";

const shouldShowComparisonIndicator = (originalValue?: number, comparisonValue?: number): boolean =>
  isValidScore(originalValue) &&
  isValidScore(comparisonValue) &&
  originalValue !== comparisonValue &&
  comparisonValue !== 0;

export const ComparisonCell = ({
  original,
  comparison,
  originalValue,
  comparisonValue,
}: {
  original: DisplayValue;
  comparison: DisplayValue;
  originalValue?: number;
  comparisonValue?: number;
}) => {
  const showComparison = shouldShowComparisonIndicator(originalValue, comparisonValue);

  return (
    <div className="flex items-center gap-2">
      <div className="text-green-300">{comparison}</div>
      <ArrowRight className="font-bold min-w-3" size={12} />
      <div className="text-blue-300">{original}</div>
      {showComparison && originalValue && comparisonValue && (
        <ComparisonIndicator originalValue={originalValue} comparisonValue={comparisonValue} />
      )}
    </div>
  );
};

export { shouldShowComparisonIndicator };

export const ChangeIndicator = ({ originalValue, comparisonValue }: { originalValue: number; comparisonValue: number }) => (
  <div className="shrink-0 ml-1">
    <span className="text-xs">
      {originalValue >= comparisonValue ? (
        <span className="text-green-300">&#x25B2;</span>
      ) : (
        <span className="text-destructive">&#x25BC;</span>
      )}
      <span className={originalValue >= comparisonValue ? "text-green-300" : "text-destructive"}>
        ({calculatePercentageChange(originalValue, comparisonValue)}%)
      </span>
    </span>
  </div>
);
