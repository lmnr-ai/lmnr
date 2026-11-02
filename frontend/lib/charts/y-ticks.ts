// Recharts' `tickCount` (its getFormatStep): exactly `count` ticks from zero, the step rounded up to a
// multiple of 0.05 × 10^k (0.1 × 10^k for single-digit steps). d3's `ticks(count)` is only a hint.
export const fixedCountTicks = (max: number, count: number): number[] => {
  const raw = max / (count - 1);
  const digits = Math.floor(Math.log10(raw)) + 1;
  const magnitude = 10 ** digits;
  const increment = digits === 1 ? 0.1 : 0.05;
  const step = Math.ceil(Number((raw / magnitude / increment).toPrecision(12))) * increment * magnitude;
  return Array.from({ length: count }, (_, i) => Number((i * step).toPrecision(12)));
};
