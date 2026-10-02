export const AUTHORED_STAGE = {width: 1280, height: 720} as const;

/** Uniformly contain authored 16:9 geometry in the live editor reservation. */
export function authoredStageSize(availableWidth: number, availableHeight: number) {
  const width = Number.isFinite(availableWidth) ? Math.max(0, availableWidth) : 0;
  const height = Number.isFinite(availableHeight) ? Math.max(0, availableHeight) : 0;
  const scale = Math.min(width / AUTHORED_STAGE.width, height / AUTHORED_STAGE.height);
  return {scale, width: AUTHORED_STAGE.width * scale, height: AUTHORED_STAGE.height * scale};
}
