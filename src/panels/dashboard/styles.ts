export const baseCss = `
  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    padding: 0;
    font-family:
      var(--vscode-font-family),
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      sans-serif;

    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);

    font-size: 13px;
    line-height: 1.5;
  }

  button,
  input {
    font: inherit;
  }

  button {
    user-select: none;
  }

  .dashboard {
    width: min(1100px, 100%);
    margin: 0 auto;
    padding: 28px 30px 60px;
  }

  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 22px;
  }

  .profile {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
  }

  .profile-info {
    min-width: 0;
  }

  .avatar {
    width: 58px;
    height: 58px;
    flex-shrink: 0;
    border-radius: 50%;
    object-fit: cover;
    border: 1px solid var(--vscode-panel-border);
  }

  .placeholder-avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    font-size: 1.35em;
    font-weight: 700;
  }

  .handle {
    font-size: 1.35em;
    font-weight: 650;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .rank-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 3px;
    font-size: 0.9em;
  }

  .rank {
    font-weight: 600;
  }

  .rating {
    font-weight: 700;
  }

  .top-actions {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
  }

  .icon-btn,
  .ghost-btn,
  .handle-form button {
    border: 1px solid var(--vscode-button-border, var(--vscode-panel-border));
    border-radius: 5px;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    cursor: pointer;
  }

  .icon-btn {
    width: 34px;
    height: 34px;
    font-size: 18px;
  }

  .icon-btn.spinning {
    animation: spin 0.8s linear infinite;
  }

  .icon-btn:hover,
  .ghost-btn:hover,
  .handle-form button:hover {
    background: var(--vscode-button-hoverBackground);
  }

  .ghost-btn {
    padding: 6px 12px;
    background: transparent;
    color: var(--vscode-foreground);
  }

  /* ---------------- Tab navigation ---------------- */

  .tabs {
    display: flex;
    gap: 4px;
    margin-bottom: 26px;
    border-bottom: 1px solid var(--vscode-panel-border);
  }

  .tab-btn {
    appearance: none;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--vscode-descriptionForeground);
    padding: 9px 14px 10px;
    font-size: 0.92em;
    font-weight: 550;
    cursor: pointer;
    white-space: nowrap;
  }

  .tab-btn:hover {
    color: var(--vscode-foreground);
  }

  .tab-btn.active {
    color: var(--vscode-foreground);
    border-bottom-color: var(--vscode-textLink-foreground);
  }

  .tab-panel {
    display: none;
  }

  .tab-panel.active {
    display: block;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 34px;
  }

  .stat-card {
    display: flex;
    align-items: center;
    gap: 13px;
    min-height: 88px;
    padding: 15px;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 9px;
    background: var(--vscode-editorWidget-background);
  }

  .stat-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    flex-shrink: 0;
    border-radius: 7px;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    font-weight: 700;
  }

  .stat-num {
    font-size: 1.35em;
    font-weight: 700;
    line-height: 1.1;
  }

  .stat-label {
    margin-top: 4px;
    color: var(--vscode-descriptionForeground);
    font-size: 0.78em;
  }

  .section {
    margin-top: 32px;
  }

  .section:first-child {
    margin-top: 0;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-bottom: 12px;
  }

  h2 {
    margin: 0;
    font-size: 1.05em;
    font-weight: 650;
  }

  .section-header p {
    margin: 2px 0 0;
    font-size: 0.8em;
  }

  .heatmap-card {
    padding: 16px 18px 14px;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 9px;
    background: var(--vscode-editorWidget-background);
  }

  .heatmap-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
    flex-wrap: wrap;
    margin-bottom: 14px;
  }

  .heatmap-title {
    font-size: 0.92em;
    font-weight: 650;
  }

  .heatmap-subtitle {
    margin-top: 2px;
    font-size: 0.76em;
    color: var(--vscode-descriptionForeground);
  }

  .heatmap-legend {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
    font-size: 0.72em;
  }

  .heatmap-legend .muted:first-child { margin-right: 2px; }
  .heatmap-legend .muted:last-child { margin-left: 2px; }

  .heatmap-scroll {
    overflow-x: auto;
    padding-bottom: 2px;
  }

  /* weekday-column and heatmap-content sit side by side; weekday-column's
     top padding equals month-row's height so the first weekday label lines
     up with the first row of cells (not the month labels above them), and
     its gap matches hm-column's gap so every subsequent label tracks its
     row exactly. */
  .heatmap-layout {
    display: flex;
    gap: 8px;
    width: max-content;
  }

  .weekday-column {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    gap: 3px;
    padding-top: 18px;
  }

  .weekday-label {
    width: 26px;
    height: 10px;
    line-height: 10px;
    text-align: right;
    font-size: 9px;
    color: var(--vscode-descriptionForeground);
    white-space: nowrap;
  }

  .heatmap-content {
    display: flex;
    flex-direction: column;
  }

  .month-row {
    display: flex;
    height: 18px;
    margin-left: 0;
  }

  .month-label {
    width: 13px;
    min-width: 13px;
    font-size: 9px;
    color: var(--vscode-descriptionForeground);
    white-space: nowrap;
  }

  .heatmap {
    display: flex;
    gap: 3px;
    width: max-content;
  }

  .hm-column {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .hm-cell {
    width: 10px;
    height: 10px;
    min-width: 10px;
    display: inline-block;
    border-radius: 2px;
  }

  .hm-l0 {
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
  }

  .hm-l1 { background: #0e4429; }
  .hm-l2 { background: #006d32; }
  .hm-l3 { background: #26a641; }
  .hm-l4 { background: #39d353; }

  .heatmap-footer {
    display: flex;
    justify-content: space-between;
    margin-top: 12px;
    font-size: 0.72em;
  }

  .bar-chart {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 15px 16px;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 9px;
    background: var(--vscode-editorWidget-background);
  }

  .bar-row {
    display: grid;
    grid-template-columns: 150px minmax(80px, 1fr) 40px 55px;
    align-items: center;
    gap: 10px;
  }

  /* Tag and difficulty charts don't have a share column. */
  .tag-row,
  .diff-row {
    grid-template-columns: 130px minmax(80px, 1fr) 40px;
  }

  .tag-chart,
  .diff-chart {
    max-height: 480px;
    overflow-y: auto;
  }

  .bar-label {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.82em;
  }

  .bar-track {
    height: 8px;
    overflow: hidden;
    border-radius: 5px;
    background: var(--vscode-editor-background);
  }

  .bar-fill {
    height: 100%;
    min-width: 2px;
    border-radius: inherit;
  }

  .bar-fill.tag-fill {
    background: var(--vscode-textLink-foreground);
  }

  .bar-count {
    text-align: right;
    font-weight: 600;
    font-size: 0.82em;
  }

  .bar-share {
    text-align: right;
    font-size: 0.75em;
  }

  /* ---------------- Rating graph ---------------- */

  .rating-graph-wrapper {
    padding: 16px 16px 12px;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 9px;
    background: var(--vscode-editorWidget-background);
  }

  .rating-graph {
    width: 100%;
    height: auto;
    display: block;
  }

  .grid-line {
    stroke: var(--vscode-panel-border);
    stroke-width: 1;
    opacity: 0.5;
  }

  .grid-label {
    fill: var(--vscode-descriptionForeground);
    font-size: 10px;
  }

  .rating-graph-footer {
    margin-top: 8px;
    font-size: 0.8em;
  }

  /* ---------------- Lists (recent submissions / contests) ---------------- */

  .recent-list {
    overflow: hidden;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 9px;
    background: var(--vscode-editorWidget-background);
  }

  .recent-item {
    display: grid;
    grid-template-columns: 10px minmax(0, 1fr) 130px 20px;
    align-items: center;
    gap: 11px;
    min-height: 52px;
    padding: 7px 13px;
    cursor: pointer;
    border-bottom: 1px solid var(--vscode-panel-border);
  }

  .contest-item {
    display: grid;
    grid-template-columns: 10px minmax(0, 1fr) 55px 70px 55px 20px;
    align-items: center;
    gap: 11px;
    min-height: 52px;
    padding: 7px 13px;
    cursor: pointer;
    border-bottom: 1px solid var(--vscode-panel-border);
  }

  .recent-item:last-child,
  .contest-item:last-child {
    border-bottom: none;
  }

  .recent-item:hover,
  .contest-item:hover {
    background: var(--vscode-list-hoverBackground);
  }

  .recent-problem,
  .contest-info {
    min-width: 0;
  }

  .recent-name,
  .contest-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.88em;
  }

  .recent-meta {
    margin-top: 1px;
    color: var(--vscode-descriptionForeground);
    font-size: 0.72em;
  }

  .recent-verdict {
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.78em;
    font-weight: 600;
  }

  .contest-rank {
    text-align: right;
    font-size: 0.82em;
  }

  .contest-rating {
    text-align: right;
    font-weight: 700;
    font-size: 0.88em;
  }

  .contest-delta {
    text-align: right;
    font-weight: 600;
    font-size: 0.82em;
  }

  .arrow {
    color: var(--vscode-descriptionForeground);
    font-size: 1.2em;
    text-align: right;
  }

  .verdict-dot {
    width: 8px;
    height: 8px;
    display: inline-block;
    border-radius: 50%;
    background: currentColor;
  }

  .empty-card {
    padding: 25px;
    text-align: center;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 9px;
    color: var(--vscode-descriptionForeground);
    background: var(--vscode-editorWidget-background);
  }

  .center-page {
    max-width: 430px;
    margin: 15vh auto 0;
    padding: 20px;
    text-align: center;
  }

  .center-page h1,
  .center-page h2 {
    margin-bottom: 8px;
  }

  .center-page p {
    margin: 0;
  }

  .empty-icon,
  .error-icon {
    width: 54px;
    height: 54px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 18px;
    border-radius: 50%;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    font-size: 1.5em;
    font-weight: 700;
  }

  .error-icon {
    background: var(--vscode-inputValidation-errorBackground);
    color: var(--vscode-errorForeground);
  }

  .error-message {
    padding: 10px 12px;
    margin-top: 14px !important;
    border-radius: 5px;
    background: var(--vscode-textCodeBlock-background);
    color: var(--vscode-errorForeground);
    font-size: 0.82em;
    word-break: break-word;
  }

  .handle-form {
    display: flex;
    gap: 8px;
    margin-top: 18px;
  }

  .handle-form input {
    flex: 1;
    min-width: 0;
    padding: 7px 10px;
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
    border-radius: 5px;
    outline: none;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
  }

  .handle-form input:focus {
    border-color: var(--vscode-focusBorder);
  }

  .handle-form button {
    padding: 7px 15px;
  }

  .spinner {
    width: 28px;
    height: 28px;
    margin: 0 auto 18px;
    border: 3px solid var(--vscode-panel-border);
    border-top-color: var(--vscode-textLink-foreground);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .muted {
    color: var(--vscode-descriptionForeground);
  }

  .v-ok { color: #39d353; }
  .v-wa { color: #f85149; }
  .v-tle { color: #d29922; }
  .v-err { color: #db6d28; }
  .v-other { color: var(--vscode-descriptionForeground); }

  .bar-fill.v-ok { background: #39d353; }
  .bar-fill.v-wa { background: #f85149; }
  .bar-fill.v-tle { background: #d29922; }
  .bar-fill.v-err { background: #db6d28; }
  .bar-fill.v-other { background: var(--vscode-descriptionForeground); }

  .rating-red { color: #f33; }
  .rating-orange { color: #ff8c00; }
  .rating-yellow { color: #bbb; }
  .rating-purple { color: #a05fff; }
  .rating-blue { color: #58a6ff; }
  .rating-cyan { color: #00b8d9; }
  .rating-green { color: #2ea043; }
  .rating-gray,
  .rating-unrated {
    color: var(--vscode-descriptionForeground);
  }

  @media (max-width: 800px) {
    .stats-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .bar-row {
      grid-template-columns: 125px minmax(60px, 1fr) 35px 45px;
    }

    .tag-row,
    .diff-row {
      grid-template-columns: 105px minmax(60px, 1fr) 35px;
    }
  }

  @media (max-width: 560px) {
    .dashboard {
      padding: 20px 15px 40px;
    }

    .topbar {
      align-items: flex-start;
    }

    .dashboard .ghost-btn {
      display: none;
    }

    .stats-grid {
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .stat-card {
      min-height: 75px;
      padding: 11px;
    }

    .stat-icon {
      display: none;
    }

    .bar-row {
      grid-template-columns: 110px 1fr 30px;
    }

    .bar-share {
      display: none;
    }

    .recent-item {
      grid-template-columns: 10px minmax(0, 1fr) 95px 15px;
    }

    .contest-item {
      grid-template-columns: 10px minmax(0, 1fr) 45px 20px;
    }

    .contest-rank {
      display: none;
    }

    .contest-delta {
      display: none;
    }

    .recent-verdict {
      font-size: 0.7em;
    }

    .weekday-column {
      display: none;
    }

    .tabs {
      overflow-x: auto;
    }
  }
`;

import { getNonce } from "./shared";

/** Wraps a body-producing function in the full HTML document + CSP, sharing one nonce. */
export function renderShell(bodyFn: (nonce: string) => string): string {
  const nonce = getNonce();

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src https: data:; font-src https: data:;">
<style>${baseCss}</style>
</head>
<body>
${bodyFn(nonce)}
</body>
</html>`;
}