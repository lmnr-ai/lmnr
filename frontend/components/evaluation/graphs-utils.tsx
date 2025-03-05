export function renderTick(tickProps: any) {
  const {
    x,
    y,
    payload: { value, offset },
  } = tickProps;
  const VERTICAL_TICK_OFFSET = 8;
  const VERTICAL_TICK_LENGTH = 4;
  const FONT_SIZE = 8;
  const BUCKET_COUNT = 10;
  const PERCENTAGE_STEP = 100 / BUCKET_COUNT;

  // Value is equal to index starting from 0
  // So we calculate percentage ticks/marks by multiplying value by 10
  return (
    <g>
      <path d={`M${x - offset},${y - VERTICAL_TICK_OFFSET}v${VERTICAL_TICK_LENGTH}`} stroke="gray" />
      <text
        x={x - offset + FONT_SIZE / 2}
        y={y + VERTICAL_TICK_OFFSET}
        textAnchor="middle"
        fill="gray"
        fontSize={FONT_SIZE}
      >
        {value * PERCENTAGE_STEP}%
      </text>
      {value === BUCKET_COUNT - 1 && (
        <>
          <path d={`M${x + offset},${y - VERTICAL_TICK_OFFSET}v${VERTICAL_TICK_LENGTH}`} stroke="gray" />
          <text
            x={x + offset - FONT_SIZE / 2}
            y={y + VERTICAL_TICK_OFFSET}
            textAnchor="middle"
            fill="gray"
            fontSize={FONT_SIZE}
          >
            100%
          </text>
        </>
      )}
    </g>
  );
}
