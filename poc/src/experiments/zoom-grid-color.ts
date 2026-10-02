/** Fade dense grids toward a quieter color, using sampled zoom progress only. */
export function zoomGridColor(denseColor: string, zoomProgress: number): string {
  const progress = Number.isFinite(zoomProgress) ? Math.max(0, Math.min(1, zoomProgress)) : 0;
  const target = /^#[\da-f]{6}$/i.test(denseColor) ? denseColor : '#1f1f1f';
  return '#' + [1, 3, 5].map(index => {
    const channel = parseInt(target.slice(index, index + 2), 16);
    return Math.round(51 + (channel - 51) * progress).toString(16).padStart(2, '0');
  }).join('');
}
