// The original straight run contained two ten-block repeats before the
// blue Thinking block used by the upward handoff. Keep the first six blocks
// and remove the following fourteen without changing the 660px/s velocity.
export const STREAM_BLOCKS_REMOVED = 14;
export const STREAM_DISTANCE_REMOVED = 2760;
export const STREAM_SPEED = 660;
export const STREAM_RUN_TRIM_SECONDS = STREAM_DISTANCE_REMOVED / STREAM_SPEED;
