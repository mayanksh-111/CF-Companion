import { CfRatingChange, CfSubmission, CfUser } from "../../cfApi";
import { renderShell } from "./styles";
import { escapeAttr, escapeHtml, formatVerdict, getRatingClass, timeAgo, verdictClass} from "./shared";
import { buildHeatmap } from "./heatmap";
import { buildVerdictStats, countUniqueSolved } from "./verdictStats";
import { buildTagStats } from "./tagStats";
import { buildDifficultyStats } from "./difficultyStats";
import { buildRatingGraph } from "./ratingGraph";
import { buildContestList } from "./contestList";

export function renderDashboard(
  user: CfUser,
  submissions: CfSubmission[],
  ratingHistory: CfRatingChange[],
): string {
  const heatmap = buildHeatmap(submissions);
  const verdictStats = buildVerdictStats(submissions);
  const solvedCount = countUniqueSolved(submissions);
  const accepted = submissions.filter((s) => s.verdict === "OK").length;
  const tagStats = buildTagStats(submissions);
  const difficultyStats = buildDifficultyStats(submissions);
  const ratingGraph = buildRatingGraph(ratingHistory);
  const contestList = buildContestList(ratingHistory);

  const recent = [...submissions]
    .sort((a, b) => b.creationTimeSeconds - a.creationTimeSeconds)
    .slice(0, 20);

  const rating = user.rating ?? null;
  const maxRating = user.maxRating ?? null;
  const ratingClass = getRatingClass(rating);

  const avatar = user.avatar
    ? `<img class="avatar" src="${escapeAttr(user.avatar)}" alt="Avatar">`
    : `<div class="avatar placeholder-avatar">${escapeHtml((user.handle ?? "?").charAt(0).toUpperCase())}</div>`;

  return renderShell(
    (nonce) => /* html */ `
      <main class="dashboard">

        <header class="topbar">
          <div class="profile">
            ${avatar}
            <div class="profile-info">
              <div class="handle">${escapeHtml(user.handle)}</div>
              <div class="rank-row">
                <span class="rank ${ratingClass}">${escapeHtml(user.rank ?? "unrated")}</span>
                ${rating !== null ? `<span class="rating ${ratingClass}">${rating}</span>` : ""}
                ${maxRating !== null ? `<span class="muted">max ${maxRating}</span>` : ""}
              </div>
            </div>
          </div>

          <div class="top-actions">
            <button id="refreshBtn" class="icon-btn" title="Refresh" aria-label="Refresh">↻</button>
            <button id="openProfileBtn" class="ghost-btn">Profile</button>
          </div>
        </header>

        <nav class="tabs">
          <button class="tab-btn active" data-tab="overview">Overview</button>
          <button class="tab-btn" data-tab="rating">Rating Graph</button>
          <button class="tab-btn" data-tab="problems">Problems</button>
          <button class="tab-btn" data-tab="contests">Contests</button>
        </nav>

        <section class="tab-panel active" data-panel="overview">

          <section class="stats-grid">
            <div class="stat-card">
              <div class="stat-icon">✓</div>
              <div>
                <div class="stat-num">${solvedCount}</div>
                <div class="stat-label">Problems Solved</div>
              </div>
            </div>
            <div class="stat-card">
              <div class="stat-icon">⌘</div>
              <div>
                <div class="stat-num">${submissions.length}</div>
                <div class="stat-label">Submissions</div>
              </div>
            </div>
            <div class="stat-card">
              <div class="stat-icon">%</div>
              <div>
                <div class="stat-num">${verdictStats.acRate}%</div>
                <div class="stat-label">Acceptance Rate</div>
              </div>
            </div>
            <div class="stat-card">
              <div class="stat-icon">⚡</div>
              <div>
                <div class="stat-num">${accepted}</div>
                <div class="stat-label">Accepted Submissions</div>
              </div>
            </div>
          </section>

          <section class="section">
            <div class="section-header">
              <div>
                <h2>Activity</h2>
                <p class="muted">Submission activity over the last year</p>
              </div>
            </div>
            ${heatmap}
          </section>

          <section class="section">
            <div class="section-header">
              <div>
                <h2>Verdicts</h2>
                <p class="muted">Your submission results</p>
              </div>
            </div>
            ${verdictStats.html}
          </section>

          <section class="section">
            <div class="section-header">
              <div>
                <h2>Recent Activity</h2>
                <p class="muted">Your latest submissions</p>
              </div>
            </div>
            ${
              recent.length
                ? `<div class="recent-list">${recent.map(renderRecentSubmission).join("")}</div>`
                : `<div class="empty-card">No submissions found.</div>`
            }
          </section>

        </section>

        <section class="tab-panel" data-panel="rating">
          <section class="section">
            <div class="section-header">
              <div>
                <h2>Rating Over Time</h2>
                <p class="muted">Rating after each rated contest</p>
              </div>
            </div>
            ${ratingGraph}
          </section>
        </section>

        <section class="tab-panel" data-panel="problems">
          <section class="section">
            <div class="section-header">
              <div>
                <h2>Solved by Tag</h2>
                <p class="muted">Which topics you've practiced most</p>
              </div>
            </div>
            ${tagStats}
          </section>

          <section class="section">
            <div class="section-header">
              <div>
                <h2>Solved by Difficulty</h2>
                <p class="muted">Distribution across problem ratings</p>
              </div>
            </div>
            ${difficultyStats}
          </section>
        </section>

        <section class="tab-panel" data-panel="contests">
          <section class="section">
            <div class="section-header">
              <div>
                <h2>Participated Contests</h2>
                <p class="muted">Rank and rating change per contest, most recent first</p>
              </div>
            </div>
            ${contestList}
          </section>
        </section>

      </main>

      <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();

        document.getElementById("refreshBtn")?.addEventListener("click", () => {
          vscode.postMessage({ command: "refresh" });
        });

        document.getElementById("openProfileBtn")?.addEventListener("click", () => {
          vscode.postMessage({
            command: "openUrl",
            url: ${JSON.stringify(`https://codeforces.com/profile/${user.handle}`)}
          });
        });

        document.querySelectorAll(".recent-item, .contest-item").forEach((item) => {
          item.addEventListener("click", () => {
            const url = item.getAttribute("data-url");
            if (!url) return;
            vscode.postMessage({ command: "openUrl", url });
          });
        });

        document.querySelectorAll(".tab-btn").forEach((btn) => {
          btn.addEventListener("click", () => {
            const target = btn.getAttribute("data-tab");
            document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
            document.querySelectorAll(".tab-panel").forEach((panel) => {
              panel.classList.toggle("active", panel.getAttribute("data-panel") === target);
            });
          });
        });

        // Reflects the extension host's background auto-refresh in the UI
        // (see DashboardPanel's poll timer) without a full page reload.
        window.addEventListener("message", (event) => {
          const msg = event.data;
          if (msg && msg.command === "refreshing") {
            document.getElementById("refreshBtn")?.classList.add("spinning");
          }
        });
      </script>
    `,
  );
}

function renderRecentSubmission(submission: CfSubmission): string {
  const problem = submission.problem;
  const contestId = problem.contestId;
  const index = problem.index;
  const url = contestId
    ? `https://codeforces.com/contest/${contestId}/problem/${index}`
    : "";
  const name = `${contestId ?? ""}${index} · ${problem.name}`;
  const verdict = submission.verdict ?? "UNKNOWN";
  const verdictLabel = formatVerdict(verdict);

  return /* html */ `
    <div class="recent-item" ${url ? `data-url="${escapeAttr(url)}"` : ""}>
      <span class="verdict-dot ${verdictClass(verdict)}"></span>
      <div class="recent-problem">
        <div class="recent-name">${escapeHtml(name)}</div>
        <div class="recent-meta">${timeAgo(submission.creationTimeSeconds)}</div>
      </div>
      <span class="recent-verdict ${verdictClass(verdict)}">${escapeHtml(verdictLabel)}</span>
      <span class="arrow">›</span>
    </div>
  `;
}