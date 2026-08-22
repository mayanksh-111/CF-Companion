import { CfRatingChange } from "../../cfApi";
import { escapeAttr, escapeHtml, getRatingHex } from "./shared";

export function buildContestList(history: CfRatingChange[]): string {
  if (!history.length) {
    return `<div class="empty-card">No rated contests yet.</div>`;
  }

  const items = [...history]
    .reverse() // most recent first
    .map((h) => {
      const delta = h.newRating - h.oldRating;
      const sign = delta > 0 ? "+" : "";
      const deltaClass = delta > 0 ? "v-ok" : delta < 0 ? "v-wa" : "muted";
      const url = `https://codeforces.com/contest/${h.contestId}/standings`;
      const date = new Date(h.ratingUpdateTimeSeconds * 1000).toLocaleDateString(
        "en-US",
        { year: "numeric", month: "short", day: "numeric" },
      );

      return /* html */ `
        <div class="contest-item" data-url="${escapeAttr(url)}">
          <span class="verdict-dot" style="background:${getRatingHex(h.newRating)}"></span>
          <div class="contest-info">
            <div class="contest-name">${escapeHtml(h.contestName)}</div>
            <div class="recent-meta">${date}</div>
          </div>
          <span class="contest-rank muted">#${h.rank}</span>
          <span class="contest-rating" style="color:${getRatingHex(h.newRating)}">${h.newRating}</span>
          <span class="contest-delta ${deltaClass}">${sign}${delta}</span>
          <span class="arrow">›</span>
        </div>
      `;
    })
    .join("");

  return `<div class="recent-list contest-list">${items}</div>`;
}