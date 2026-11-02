type Bezier = [number, number, number, number];

// Solves x(t) = x for a CSS-style cubic-bezier, then returns y(t).
const cubicBezier =
  ([x1, y1, x2, y2]: Bezier) =>
  (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const sample = (a: number, b: number, t: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t ** 2 * (1 - t) + t ** 3;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (sample(x1, x2, mid) < x) lo = mid;
      else hi = mid;
    }
    return sample(y1, y2, (lo + hi) / 2);
  };

export const easeOut = cubicBezier([0.22, 1, 0.36, 1]);

export const linear = (x: number) => Math.max(0, Math.min(1, x));
