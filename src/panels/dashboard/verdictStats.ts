import { CfSubmission } from "../../cfApi";
import { escapeHtml, formatVerdict, verdictClass } from "./shared";

export function buildVerdictStats(submissions: CfSubmission[]): { html: string; acRate: string; }{
  const counts = new Map<string, number>();

  for(const submission of submissions){
    const verdict = submission.verdict ?? "UNKNOWN";
    counts.set(verdict, (counts.get(verdict) ?? 0) + 1);
  }

  const total = submissions.length;
  const accepted = counts.get("OK") ?? 0;
  const acRate = total === 0 ? "0.0" : ((accepted / total) * 100).toFixed(1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7);

  if(!sorted.length){
    return{
      html: `<div class="empty-card">No verdict data available.</div>`,
      acRate,
    };
  }

  const max = Math.max(...sorted.map(([, count]) => count), 1);
  const bars = sorted
    .map(([verdict, count]) => {
      const percentage = Math.round((count / max) * 100);
      const share = total === 0 ? 0 : ((count / total) * 100).toFixed(1);

      return /* html */ `
        <div class="bar-row">
          <div class="bar-label">
            <span class="verdict-dot ${verdictClass(verdict)}"></span>
            <span class="${verdictClass(verdict)}">${escapeHtml(formatVerdict(verdict))}</span>
          </div>
          <div class="bar-track">
            <div class="bar-fill ${verdictClass(verdict)}" style="width:${percentage}%"></div>
          </div>
          <div class="bar-count">${count}</div>
          <div class="bar-share muted">${share}%</div>
        </div>
      `;
    })
    .join("");

  return { html: `<div class="bar-chart">${bars}</div>`, acRate };
}

export function countUniqueSolved(submissions: CfSubmission[]): number {
  const solved = new Set<string>();

  for(const submission of submissions){
    if(submission.verdict !== "OK") continue;
    solved.add(`${submission.problem.contestId ?? ""}-${submission.problem.index}`);
  }
  return solved.size;
}