import { CfRatingChange } from "../../cfApi";
import { escapeHtml, getRatingHex } from "./shared";

const WIDTH = 900;
const HEIGHT = 260;
const PAD_X = 40;
const PAD_TOP = 24;
const PAD_BOTTOM = 32;

export function buildRatingGraph(history: CfRatingChange[]): string {
  if(!history.length) {
    return `<div class="empty-card">No rated contests yet — your rating graph will appear here once you compete.</div>`;
  }

  const ratings = history.map((h) => h.newRating);
  const minRating = Math.min(...ratings, history[0].oldRating) - 60;
  const maxRating = Math.max(...ratings) + 60;
  const span = Math.max(maxRating - minRating, 1);

  const plotW = WIDTH - PAD_X * 2;
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const xFor = (i: number) => history.length === 1 ? PAD_X + plotW / 2 : PAD_X + (i / (history.length - 1)) * plotW;
  const yFor = (rating: number) => PAD_TOP + plotH - ((rating - minRating) / span) * plotH;

  const bands: { from: number; to: number; color: string }[] = [
    { from: 0, to: 1200, color: "#8a8a8a" },
    { from: 1200, to: 1400, color: "#2ea043" },
    { from: 1400, to: 1600, color: "#00b8d9" },
    { from: 1600, to: 1900, color: "#58a6ff" },
    { from: 1900, to: 2100, color: "#a05fff" },
    { from: 2100, to: 2400, color: "#ff8c00" },
    { from: 2400, to: 4000, color: "#ff2b2b" },
  ];

  const bandRects = bands
    .filter((b) => b.to > minRating && b.from < maxRating)
    .map((b) => {
      const top = yFor(Math.min(b.to, maxRating));
      const bottom = yFor(Math.max(b.from, minRating));
      return `<rect x="${PAD_X}" y="${top}" width="${plotW}" height="${Math.max(bottom - top, 0)}" fill="${b.color}" opacity="0.08"></rect>`;
    })
    .join("");

  const points = history.map((h, i) => ({ x: xFor(i), y: yFor(h.newRating), h }));

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");

  const dots = points
    .map((p) => {
      const delta = p.h.newRating - p.h.oldRating;
      const sign = delta > 0 ? "+" : "";
      const date = new Date(p.h.ratingUpdateTimeSeconds * 1000).toLocaleDateString(
        "en-US",
        { year: "numeric", month: "short", day: "numeric" },
      );
      const tooltip = `${p.h.contestName}\n${date} · Rank ${p.h.rank}\n${p.h.oldRating} → ${p.h.newRating} (${sign}${delta})`;
      return /* html */ `
        <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.4" fill="${getRatingHex(p.h.newRating)}" stroke="var(--vscode-editor-background)" stroke-width="1.2">
          <title>${escapeHtml(tooltip)}</title>
        </circle>
      `;
    })
    .join("");

  const current = history[history.length - 1];
  const currentColor = getRatingHex(current.newRating);

  const gridLines = buildGridLines(minRating, maxRating, yFor, plotW);

  return /* html */ `
    <div class="rating-graph-wrapper">
      <svg viewBox="0 0 ${WIDTH} ${HEIGHT}" class="rating-graph" preserveAspectRatio="none">
        ${bandRects}
        ${gridLines}
        <path d="${linePath}" fill="none" stroke="${currentColor}" stroke-width="2"></path>
        ${dots}
      </svg>
      <div class="rating-graph-footer muted">
        ${history.length} rated contest${history.length === 1 ? "" : "s"} · current rating <strong style="color:${currentColor}">${current.newRating}</strong>
      </div>
    </div>
  `;
}

function buildGridLines(
  minRating: number,
  maxRating: number,
  yFor: (r: number) => number,
  plotW: number,
): string {
  const step = niceStep(maxRating - minRating);
  const first = Math.ceil(minRating / step) * step;

  const lines: string[] = [];
  for (let r = first; r <= maxRating; r += step) {
    const y = yFor(r);
    lines.push(/* html */ `
      <line x1="${PAD_X}" y1="${y.toFixed(1)}" x2="${PAD_X + plotW}" y2="${y.toFixed(1)}" class="grid-line"></line>
      <text x="${PAD_X - 8}" y="${(y + 3).toFixed(1)}" class="grid-label" text-anchor="end">${r}</text>
    `);
  }
  return lines.join("");
}

function niceStep(range: number): number {
  const candidates = [50, 100, 200, 300, 400, 500, 1000];
  for(const c of candidates) {
    if(range / c <= 6) return c;
  }
  return 1000;
}