import { CfSubmission } from "../../cfApi";
import { escapeHtml } from "./shared";

const MAX_TAGS_SHOWN = 18;

export function buildTagStats(submissions: CfSubmission[]): string {
  const solvedProblems = new Map<string, string[]>();

  for(const submission of submissions){
    if(submission.verdict !== "OK") continue;
    const key = `${submission.problem.contestId ?? ""}-${submission.problem.index}`;
    if(!solvedProblems.has(key)){
      solvedProblems.set(key, submission.problem.tags ?? []);
    }
  }

  const tagCounts = new Map<string, number>();
  for(const tags of solvedProblems.values()){
    for(const tag of tags){
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  if(!tagCounts.size){
    return `<div class="empty-card">Solve a few problems to see your tag breakdown.</div>`;
  }

  const sorted = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_TAGS_SHOWN);

  const max = Math.max(...sorted.map(([, count]) => count), 1);
  const rows = sorted
    .map(([tag, count]) => {
      const percentage = Math.round((count / max) * 100);
      return /* html */ `
        <div class="bar-row tag-row">
          <div class="bar-label" title="${escapeHtml(tag)}">${escapeHtml(tag)}</div>
          <div class="bar-track">
            <div class="bar-fill tag-fill" style="width:${percentage}%"></div>
          </div>
          <div class="bar-count">${count}</div>
        </div>
      `;
    })
    .join("");

  return `<div class="bar-chart tag-chart">${rows}</div>`;
}