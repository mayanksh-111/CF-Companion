import { CfSubmission } from "../../cfApi";

const DAY_MS = 24 * 60 * 60 * 1000;

export function buildHeatmap(submissions: CfSubmission[]): string {
  const dayCounts = new Map<string, number>();

  for(const submission of submissions){
    const date = new Date(submission.creationTimeSeconds * 1000);
    const key = date.toISOString().slice(0, 10);

    dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const weeks = 53;
  const totalDays = weeks * 7;

  const end = new Date(today);
  const start = new Date(end.getTime() - (totalDays - 1) * DAY_MS);

  // Align to Sunday so every column represents a complete week.
  const startAligned = new Date(start.getTime() - start.getUTCDay() * DAY_MS);

  const monthLabels: string[] = [];
  const columns: string[] = [];

  const weekdayLabels = [
    "Sun",
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
    "Sat",
  ];

  for(let week = 0;week < weeks;week++){
    const cells: string[] = [];

    for(let day = 0; day < 7; day++){
      const date = new Date(startAligned.getTime() + (week * 7 + day) * DAY_MS);

      const key = date.toISOString().slice(0, 10);
      const count = dayCounts.get(key) ?? 0;

      const level = count === 0 ? 0 : count <= 1 ? 1 : count <= 3 ? 2 : count <= 6 ? 3 : 4;

      const formattedDate = date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      });

      const submissionLabel = count === 1 ? "submission" : "submissions";

      cells.push(/* html */ `
        <div
          class="hm-cell hm-l${level}"
          title="${formattedDate} · ${count} ${submissionLabel}"
          aria-label="${formattedDate} · ${count} ${submissionLabel}"
        ></div>
      `);
    }

    const firstDay = new Date(startAligned.getTime() + week * 7 * DAY_MS);
    const isFirstWeekOfMonth = firstDay.getUTCDate() <= 7;
    const monthLabel = isFirstWeekOfMonth ? firstDay.toLocaleString("en-US", { month: "short", timeZone: "UTC",}) : "";

    monthLabels.push(`<span class="month-label">${monthLabel}</span>`);

    columns.push(/* html */ `<div class="hm-column">${cells.join("")}</div>`);
  }

  const weekdayHtml = weekdayLabels.map((day) => `<span class="weekday-label">${day}</span>`).join("");

  return /* html */ `
    <div class="heatmap-card">

      <div class="heatmap-header">
        <div>
          <div class="heatmap-title">
            Submission Activity
          </div>
          <div class="heatmap-subtitle">
            Daily submissions over the past year
          </div>
        </div>

        <div class="heatmap-legend">
          <span class="muted">Less</span>
          <span class="hm-cell hm-l0"></span>
          <span class="hm-cell hm-l1"></span>
          <span class="hm-cell hm-l2"></span>
          <span class="hm-cell hm-l3"></span>
          <span class="hm-cell hm-l4"></span>
          <span class="muted">More</span>
        </div>
      </div>

      <div class="heatmap-scroll">

        <div class="heatmap-layout">

          <div class="weekday-column">
            ${weekdayHtml}
          </div>

          <div class="heatmap-content">

            <div class="month-row">
              ${monthLabels.join("")}
            </div>

            <div class="heatmap">
              ${columns.join("")}
            </div>

          </div>

        </div>

      </div>

      <div class="heatmap-footer">
        <span class="muted">
          Each square represents one day
        </span>

        <span class="muted">
          ${submissions.length.toLocaleString()} total submissions
        </span>
      </div>

    </div>
  `;
}