export type Rect = {x: number; y: number; width: number; height: number};

export const STAGE = {width: 1280, height: 720};
export const GRID = {x: -110, y: -90, columns: 15, rows: 9, cell: 100};

// Figma start 4733:23727 and end 4732:23137.
export const CLOUDS = {
  start: [
    {x: -576, y: -398.3577575683594, width: 2449.365234375, height: 1376.0479736328125},
    {x: 210.81927490234375, y: -226.5876007080078, width: 1884.7794189453125, height: 1058.8648681640625},
  ],
  end: [
    {x: -642, y: 123, width: 1499, height: 842},
    {x: 553.208984375, y: 126.6953125, width: 1499, height: 842},
  ],
} satisfies {start: [Rect, Rect]; end: [Rect, Rect]};

export const TRIANGLES = new Map<string, string>([
  ['1:3', 'group-151.svg'], ['1:6', 'group-152.svg'],
  ['2:1', 'group-153.svg'], ['2:9', 'group-154.svg'],
  ['3:3', 'group-155.svg'], ['3:4', 'group-154.svg'], ['3:7', 'group-156.svg'],
  ['3:10', 'group-155.svg'], ['3:12', 'group-150.svg'],
  ['5:6', 'group-153.svg'], ['5:10', 'group-156.svg'],
  ['6:2', 'group-154.svg'], ['6:9', 'group-155.svg'], ['6:12', 'group-152.svg'],
  ['7:6', 'group-151.svg'],
]);

export const lerp = (from: number, to: number, progress: number) => from + (to - from) * progress;
export const interpolateRect = (from: Rect, to: Rect, progress: number): Rect => ({
  x: lerp(from.x, to.x, progress), y: lerp(from.y, to.y, progress),
  width: lerp(from.width, to.width, progress), height: lerp(from.height, to.height, progress),
});

export const interpolateCloudRects = (progress: number, finalYOffset = 0, translateY = 0, translateX: [number, number] = [0, 0]): [Rect, Rect] => {
  const end: [Rect, Rect] = [
    {...CLOUDS.end[0], y: CLOUDS.end[0].y + finalYOffset},
    {...CLOUDS.end[1], y: CLOUDS.end[1].y + finalYOffset},
  ];
  return [interpolateRect(CLOUDS.start[0], end[0], progress),
    interpolateRect(CLOUDS.start[1], end[1], progress)]
    .map((rect, index) => ({...rect, x: rect.x + translateX[index], y: rect.y + translateY})) as [Rect, Rect];
};
