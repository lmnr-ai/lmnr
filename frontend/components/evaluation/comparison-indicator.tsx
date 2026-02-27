import { calculatePercentageChange } from "./utils";

interface ComparisonIndicatorProps {
  originalValue: number;
  comparisonValue: number;
}

const ComparisonIndicator = ({ originalValue, comparisonValue }: ComparisonIndicatorProps) => (
  <span className="text-secondary-foreground">
    {originalValue >= comparisonValue ? "▲" : "▼"}({calculatePercentageChange(originalValue, comparisonValue)}%)
  </span>
);

export default ComparisonIndicator;
