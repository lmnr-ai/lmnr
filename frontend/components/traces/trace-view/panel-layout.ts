/**
 * Pure functions for the trace-view panel layout.
 *
 * Single source of truth: `targets` = the user's drag intent for each panel.
 * `applyDrag` updates targets in response to a drag delta. `computeLayout`
 * derives the rendered widths from targets + visibility + container width.
 *
 * Targets are persisted; rendered widths are not.
 */

export type ResizablePanel = "trace" | "span" | "chat";

export type Targets = Readonly<Record<ResizablePanel, number>>;
export type Widths = Targets;
export type Visible = Readonly<{ span: boolean; chat: boolean }>;

export const PANELS: Readonly<Record<ResizablePanel, { min: number; default: number }>> = {
  trace: { min: 488, default: 500 },
  span: { min: 400, default: 405 },
  chat: { min: 375, default: 385 },
};

export const DEFAULT_TARGETS: Targets = {
  trace: PANELS.trace.default,
  span: PANELS.span.default,
  chat: PANELS.chat.default,
};

function visibleOrder(visible: Visible): ResizablePanel[] {
  const out: ResizablePanel[] = ["trace"];
  if (visible.span) out.push("span");
  if (visible.chat) out.push("chat");
  return out;
}

/**
 * Derive rendered widths from targets, visibility, and container width.
 *
 * - Hidden panels' output equals their target (irrelevant; not rendered).
 * - Visible panels are clamped to at-least-min before fitting.
 * - If Σ visible widths ≤ maxWidth: render at clamped target; gap is absorbed by the container.
 * - If Σ > maxWidth: shrink proportionally using above-min slack.
 *   If slack is exhausted (overflow policy), shrink visible panels proportionally below their mins.
 * - If maxWidth is not finite (not yet measured), return clamped targets.
 */
export function computeLayout(targets: Targets, visible: Visible, maxWidth: number): Widths {
  const order = visibleOrder(visible);
  const widths: Record<ResizablePanel, number> = { ...targets };

  for (const k of order) widths[k] = Math.max(widths[k], PANELS[k].min);

  if (!Number.isFinite(maxWidth)) return widths;

  const sum = order.reduce((s, k) => s + widths[k], 0);
  if (sum <= maxWidth) return widths;

  let deficit = sum - maxWidth;

  const slack: Record<ResizablePanel, number> = { trace: 0, span: 0, chat: 0 };
  let totalSlack = 0;
  for (const k of order) {
    slack[k] = Math.max(0, widths[k] - PANELS[k].min);
    totalSlack += slack[k];
  }

  if (totalSlack > 0) {
    let remaining = deficit;
    for (const k of order) {
      const share = Math.min(slack[k], Math.round(deficit * (slack[k] / totalSlack)));
      const actual = Math.min(share, remaining);
      widths[k] -= actual;
      remaining -= actual;
    }
    if (remaining > 0) {
      for (let i = order.length - 1; i >= 0 && remaining > 0; i--) {
        const k = order[i];
        const absorb = Math.min(remaining, widths[k] - PANELS[k].min);
        widths[k] -= absorb;
        remaining -= absorb;
      }
    }
    deficit = remaining;
    if (deficit <= 0) return widths;
  }

  const totalWidth = order.reduce((s, k) => s + widths[k], 0);
  if (totalWidth <= 0) return widths;

  let remaining2 = deficit;
  for (const k of order) {
    const share = Math.round(deficit * (widths[k] / totalWidth));
    const actual = Math.min(share, remaining2);
    widths[k] -= actual;
    remaining2 -= actual;
  }
  if (remaining2 > 0) {
    const last = order[order.length - 1];
    widths[last] -= remaining2;
  }

  return widths;
}

/**
 * Update drag targets in response to a left-edge drag on `panel`.
 *
 * - delta > 0 (grow): add to target. If total exceeds maxWidth, cascade-shrink LEFT
 *   visible neighbors down to their mins; if still over, cap the target's growth.
 * - delta < 0 (shrink): clamp target to its min; propagate any leftover shrink RIGHTWARD,
 *   each panel clamping at its min.
 *
 * Operates on the *currently rendered* widths, not raw targets — otherwise after a fit
 * (container resize / panel becoming visible) targets can exceed maxWidth and the drag
 * delta desynchronises from cursor movement. Only visible panels participate; hidden
 * panels' targets are unchanged.
 */
export function applyDrag(
  targets: Targets,
  visible: Visible,
  panel: ResizablePanel,
  delta: number,
  maxWidth: number
): Targets {
  const order = visibleOrder(visible);
  const idx = order.indexOf(panel);
  if (idx === -1 || delta === 0) return targets;

  const start = computeLayout(targets, visible, maxWidth);
  const next: Record<ResizablePanel, number> = { ...start };

  if (delta > 0) {
    next[panel] = start[panel] + delta;

    if (Number.isFinite(maxWidth)) {
      const total = order.reduce((s, k) => s + next[k], 0);
      let overflow = total - maxWidth;
      if (overflow > 0) {
        for (let i = idx - 1; i >= 0 && overflow > 0; i--) {
          const k = order[i];
          const shrinkable = Math.max(0, next[k] - PANELS[k].min);
          const amt = Math.min(shrinkable, overflow);
          next[k] -= amt;
          overflow -= amt;
        }
        if (overflow > 0) next[panel] -= overflow;
      }
    }
  } else {
    let remaining = delta;
    for (let i = idx; i < order.length && remaining < 0; i++) {
      const k = order[i];
      const cur = next[k];
      const newW = Math.max(PANELS[k].min, cur + remaining);
      next[k] = newW;
      remaining -= newW - cur;
    }
  }

  return next;
}
