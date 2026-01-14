import { isNil } from "lodash";
import React from "react";

import { type TimeSeriesChartConfig, type TimeSeriesDataPoint } from "./types";

interface CustomBarProps {
  fill?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: TimeSeriesDataPoint;
  dataKey?: string;
  chartConfig?: TimeSeriesChartConfig;
  fields?: readonly string[];
}

const MIN_BAR_HEIGHT = 3;

function getBarPositionInStack(
  dataKey: string,
  payload: TimeSeriesDataPoint,
  chartConfig: TimeSeriesChartConfig,
  fields: readonly string[]
): "top" | "bottom" | "middle" | "solo" {
  const currentConfig = chartConfig[dataKey];

  if (!currentConfig?.stackId) {
    return "solo";
  }

  const stackId = currentConfig.stackId;

  // Find all fields in the same stack that have non-zero values
  const stackedFieldsWithValues = fields.filter((field) => {
    const config = chartConfig[field];
    if (!config || config.stackId !== stackId) return false;
    const value = payload[field];
    return typeof value === "number" && value > 0;
  });

  if (stackedFieldsWithValues.length <= 1) {
    return "solo";
  }

  const currentIndex = stackedFieldsWithValues.indexOf(dataKey);

  if (currentIndex === 0) {
    return "bottom";
  } else if (currentIndex === stackedFieldsWithValues.length - 1) {
    return "top";
  } else {
    return "middle";
  }
}

function getCornerRadius(position: "top" | "bottom" | "middle" | "solo"): [number, number, number, number] {
  const radius = 4;

  switch (position) {
    case "top":
      return [radius, radius, 0, 0];
    case "bottom":
      return [0, 0, radius, radius];
    case "middle":
      return [0, 0, 0, 0];
    case "solo":
      return [radius, radius, radius, radius];
  }
}

const RoundedBar = (props: CustomBarProps) => {
  const { fill, x, y, width, height = 0, payload, dataKey, chartConfig, fields } = props;

  if (isNil(x) || isNil(y) || isNil(width) || !fill || !payload || !dataKey) {
    return <></>;
  }

  const value = payload[dataKey];
  if (!value || (typeof value === "number" && value <= 0)) {
    return <></>;
  }

  const barHeight = height > 0 && height < MIN_BAR_HEIGHT ? MIN_BAR_HEIGHT : height;
  const barY = barHeight > height ? y - (barHeight - height) : y;

  let cornerRadius: [number, number, number, number];

  if (chartConfig && fields) {
    const position = getBarPositionInStack(dataKey, payload, chartConfig, fields);
    cornerRadius = getCornerRadius(position);
  } else {
    cornerRadius = [4, 4, 4, 4];
  }

  const [tl, tr, br, bl] = cornerRadius;

  return (
    <path
      d={`
        M ${x} ${barY + tl}
        Q ${x} ${barY}, ${x + tl} ${barY}
        L ${x + width - tr} ${barY}
        Q ${x + width} ${barY}, ${x + width} ${barY + tr}
        L ${x + width} ${barY + barHeight - br}
        Q ${x + width} ${barY + barHeight}, ${x + width - br} ${barY + barHeight}
        L ${x + bl} ${barY + barHeight}
        Q ${x} ${barY + barHeight}, ${x} ${barY + barHeight - bl}
        Z
      `}
      fill={fill}
    />
  );
};

export default RoundedBar;
