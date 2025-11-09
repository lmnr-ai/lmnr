import { isNil } from "lodash";
import React from "react";

import { TimeSeriesDataPoint } from "./types";

interface CustomBarProps {
  fill?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: TimeSeriesDataPoint;
}

const MIN_BAR_HEIGHT = 3;

const RoundedBar = (props: CustomBarProps) => {
  const { fill, x, y, width, height = 0, payload } = props;

  if (isNil(x) || isNil(y) || isNil(width) || !fill || !payload) return <></>;

  const barHeight = height > 0 && height < MIN_BAR_HEIGHT ? MIN_BAR_HEIGHT : height;
  const barY = barHeight > height ? y - (barHeight - height) : y;

  const radius = [4, 4, 4, 4];
  const [tl, tr, br, bl] = radius;

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

