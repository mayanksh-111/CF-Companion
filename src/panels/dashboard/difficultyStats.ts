import { CfSubmission } from "../../cfApi";
import { getRatingHex } from "./shared";

export function buildDifficultyStats(submissions: CfSubmission[]): string {
  const solvedRatings = new Map<string, number | undefined>();

  for(const submission of submissions){
    if(submission.verdict !== "OK") continue;
    const key = `${submission.problem.contestId ?? ""}-${submission.problem.index}`;
    if(!solvedRatings.has(key)){
      solvedRatings.set(key, submission.problem.rating);
    }
  }

  const buckets = new Map<number, number>();
  let unrated = 0;

  for(const rating of solvedRatings.values()){
    if(rating === undefined || rating === null){
      unrated++;
      continue;
    }
    const bucket = Math.floor(rating / 100) * 100;
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  }

  if(!buckets.size && !unrated){
    return `<div class="empty-card">Solve a few problems to see your difficulty spread.</div>`;
  }

  const sortedBuckets = [...buckets.entries()].sort((a, b) => a[0] - b[0]);
  const max = Math.max(...sortedBuckets.map(([, count]) => count), unrated, 1);

  const rows = sortedBuckets
    .map(([bucket, count]) => {
      const percentage = Math.round((count / max) * 100);
      const color = getRatingHex(bucket);
      return /* html */ `
        <div class="bar-row diff-row">
          <div class="bar-label" style="color:${color}">${bucket}</div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${percentage}%; background:${color}"></div>
          </div>
          <div class="bar-count">${count}</div>
        </div>
      `;
    })
    .join("");

  const unratedRow = unrated
    ? /* html */ `
      <div class="bar-row diff-row">
        <div class="bar-label muted">Unrated</div>
        <div class="bar-track">
          <div class="bar-fill v-other" style="width:${Math.round((unrated / max) * 100)}%"></div>
        </div>
        <div class="bar-count">${unrated}</div>
      </div>
    `
    : "";

  return `<div class="bar-chart diff-chart">${rows}${unratedRow}</div>`;
}