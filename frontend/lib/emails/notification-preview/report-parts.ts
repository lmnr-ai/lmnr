// Building blocks for the redesigned Signals Report (Figma 4646:3638).
// Table-based on purpose: flexbox is unsupported in Gmail's mobile apps for
// non-Google accounts and in Outlook's Word engine. Everything here is a pure
// string function so the Rust port is a line-by-line translation.
import { getClusterColorById } from "../cluster-color";
import { blendHex, escapeHtml, type NotificationEmailTheme } from "../notification-theme";

/** Gmail strips SVG, so icons are rasterized to PNG server-side. Rust will
 *  render the same paths with `resvg` and attach them as CID parts. */
export function iconSrc(name: "box" | "arrow-up-right", color: string): string {
  return `/api/email-icon?icon=${name}&color=${encodeURIComponent(color)}`;
}

export function icon(name: "box" | "arrow-up-right", color: string, size: number): string {
  return `<img src="${iconSrc(name, color)}" width="${size}" height="${size}" alt="" style="display:inline-block;vertical-align:middle;border:0;" />`;
}

export interface ClusterRow {
  id: string;
  name: string;
  count: number;
  prevCount: number;
  href: string;
}

export interface ChartBucket {
  label: string;
  value: number;
}

/** Poisson rate-change z-score. Counts are Poisson (variance ~ mean), so
 *  dividing by sqrt(combined) measures standard deviations instead of letting
 *  low-count noise (0->1) dominate a scale-free percentage. */
export function zScore(count: number, prevCount: number): number {
  const combined = count + prevCount;
  if (combined === 0) return 0;
  return (count - prevCount) / Math.sqrt(combined);
}

export const MIN_COMBINED_COUNT = 5;

/** Rank by |z|, but new clusters (no previous period) always sort last: their
 *  z is unbounded by construction and would otherwise monopolise the top. */
export function rankClusters(rows: ClusterRow[], limit: number): ClusterRow[] {
  return rows
    .filter((r) => r.count + r.prevCount >= MIN_COMBINED_COUNT)
    .sort((a, b) => {
      const aNew = a.prevCount === 0;
      const bNew = b.prevCount === 0;
      if (aNew !== bNew) return aNew ? 1 : -1;
      return Math.abs(zScore(b.count, b.prevCount)) - Math.abs(zScore(a.count, a.prevCount));
    })
    .slice(0, limit);
}

/** Percent change, or null for a brand-new cluster (renders as "NEW"). */
export function pctChange(count: number, prevCount: number): number | null {
  if (prevCount === 0) return null;
  return ((count - prevCount) / prevCount) * 100;
}

/** Triangle glyph + colored percentage. Up is bad (more failures) => red. */
export function deltaCell(t: NotificationEmailTheme, count: number, prevCount: number): string {
  const pct = pctChange(count, prevCount);
  if (pct === null) {
    return `<span style="font-size:${t.bodySize}px;color:${t.mutedText};">NEW</span>`;
  }
  if (pct === 0) {
    return `<span style="font-size:${t.bodySize}px;color:${t.mutedText};">0.0%</span>`;
  }
  const up = pct > 0;
  const color = up ? t.reportUp : t.reportDown;
  const glyph = up ? "&#9650;" : "&#9660;";
  return `<span style="font-size:${t.metaSize}px;color:${color};">${glyph}</span><span style="display:inline-block;width:2px;font-size:0;">&nbsp;</span><span style="font-size:${t.bodySize}px;color:${color};">${Math.abs(pct).toFixed(1)}%</span>`;
}

/** One rounded row. The proportion bar is a hard-stop linear-gradient rather than
 *  an absolutely-positioned div: Gmail strips `position` entirely. Outlook's
 *  Word engine drops the gradient and keeps the flat row background. */
export function clusterRow(t: NotificationEmailTheme, row: ClusterRow, maxCount: number): string {
  const accent = getClusterColorById(row.id);
  const tint = blendHex(accent, t.reportRowBackground, t.reportBarOpacity);
  const pct = maxCount > 0 ? Math.round((row.count / maxCount) * 100) : 0;
  const bar =
    `background-color:${t.reportRowBackground};` +
    `background-image:linear-gradient(to right,${tint} 0%,${tint} ${pct}%,${t.reportRowBackground} ${pct}%);`;

  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin-bottom:4px;${bar}border-radius:16px;">
  <tr>
    <td style="padding:6px 12px 6px 10px;font-size:${t.bodySize}px;color:${t.text};" align="left" valign="middle">
      <table cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
        <td width="24" valign="middle" style="line-height:0;">${icon("box", accent, 16)}</td>
        <td valign="middle" style="font-size:${t.bodySize}px;color:${t.text};line-height:16px;">${escapeHtml(row.name)}</td>
      </tr></table>
    </td>
    <td style="padding:6px 4px;font-size:${t.bodySize}px;color:${t.mutedText};white-space:nowrap;" align="right">${row.count} events</td>
    <td style="padding:6px 4px;white-space:nowrap;" align="right" width="80">${deltaCell(t, row.count, row.prevCount)}</td>
    <td style="padding:6px 12px 6px 8px;" align="right" width="20">
      <a href="${row.href}" style="text-decoration:none;">${icon("arrow-up-right", t.mutedText, 16)}</a>
    </td>
  </tr>
</table>`;
}

/** Events-over-time chart with email-safe axes. Nested tables replace SVG,
 *  absolute positioning, and generated images. */
export function barChart(t: NotificationEmailTheme, buckets: ChartBucket[]): string {
  const maxValue = Math.max(...buckets.map((b) => b.value), 0);
  const scaleMax = Math.max(maxValue, 1);
  const middle = buckets[Math.floor((buckets.length - 1) / 2)];
  const fill = t.reportChartFill;
  const cells = buckets
    .map((bucket) => {
      const h = bucket.value === 0 ? 0 : Math.max(2, Math.round((bucket.value / scaleMax) * t.reportChartHeight));
      const pad = t.reportChartHeight - h;
      return `<td width="${(100 / buckets.length).toFixed(3)}%" valign="bottom" style="padding:0 2px;">
      <div style="height:${pad}px;line-height:${pad}px;font-size:0;">&nbsp;</div>
      <div style="height:${h}px;line-height:${h}px;font-size:0;background:${fill};border-radius:2px 2px 0 0;">&nbsp;</div>
    </td>`;
    })
    .join("\n    ");

  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
  <tr>
    <td width="28" valign="top" style="padding:0 8px 0 0;font-size:${t.metaSize}px;line-height:${t.metaSize}px;color:${t.faintText};" align="right">${maxValue}</td>
    <td>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="height:${t.reportChartHeight}px;border-bottom:1px solid ${t.border};">
        <tr valign="bottom">${cells}</tr>
      </table>
    </td>
  </tr>
  <tr>
    <td width="28" valign="top" style="padding:2px 8px 0 0;font-size:${t.metaSize}px;color:${t.faintText};" align="right">0</td>
    <td style="padding-top:4px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
        <td width="33.333%" style="font-size:${t.metaSize}px;color:${t.faintText};" align="left">${escapeHtml(buckets[0]?.label ?? "")}</td>
        <td width="33.333%" style="font-size:${t.metaSize}px;color:${t.faintText};" align="center">${escapeHtml(middle?.label ?? "")}</td>
        <td width="33.333%" style="font-size:${t.metaSize}px;color:${t.faintText};" align="right">${escapeHtml(buckets.at(-1)?.label ?? "")}</td>
      </tr></table>
    </td>
  </tr>
</table>`;
}
