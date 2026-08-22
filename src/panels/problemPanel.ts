import * as vscode from "vscode";
import { IncomingProblem } from "../types";
import { CfSubmission } from "../cfApi";
import { formatVerdict } from "./dashboard/shared";

export type ProblemStatus =
  | "Accepted"
  | "Wrong Answer"
  | "Time Limit"
  | "Memory Limit"
  | "Runtime Error"
  | "Compilation Error"
  | "Idleness Limit"
  | "Challenged"
  | "Judging…"
  | "Unknown"
  | "Not Attempted"
  | "Pretest Passed"
  | "Loading";


const UNCACHED_STATUSES: ReadonlySet<ProblemStatus> = new Set([
  "Loading",
  "Unknown",
  "Not Attempted",
]);


function pickBestStatus(
  current: ProblemStatus,
  incoming: ProblemStatus,
): ProblemStatus {
  if (current === "Accepted") {
    return "Accepted";
  }
  if (incoming === "Accepted") {
    return "Accepted";
  }
  if (UNCACHED_STATUSES.has(incoming) && !UNCACHED_STATUSES.has(current)) {
    return current;
  }
  return incoming;
}


export function getProblemStatus(
  submissions: CfSubmission[],
  contestId: string,
  problemCode: string,
  problemName?: string,
): ProblemStatus {
  const normalizedName = problemName?.trim().toLowerCase();

  let mostRecentVerdict: string | undefined;
  let sawMatch = false;

  for (const submission of submissions) {
    const submissionContestId = submission.problem.contestId?.toString();

    const sameId =
      submissionContestId === contestId &&
      submission.problem.index === problemCode;

    const sameName =
      normalizedName !== undefined &&
      submission.problem.name.trim().toLowerCase() === normalizedName;

    if (!sameId && !sameName) {
      continue;
    }

    sawMatch = true;

    if (submission.verdict === "OK") {
      // Accepted Status gets priority
      return "Accepted";
    }

    if (mostRecentVerdict === undefined) {
      mostRecentVerdict = submission.verdict;
    }
  }

  if (!sawMatch) {
    return "Not Attempted";
  }

  return formatVerdict(mostRecentVerdict as string) as ProblemStatus;
}


export class ProblemPanel {
  private static readonly instances = new Map<string, ProblemPanel>();
  
  private static activeKey: string | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private disposables: vscode.Disposable[] = [];
  private readonly currentProblemKey: string;
  private lastProblem: IncomingProblem | undefined;
  private lastStatus: ProblemStatus = "Not Attempted";
  
  private statusGeneration = 0;

  private static statusRefreshHandler:
    | ((problem: IncomingProblem, generation: number) => Promise<void>)
    | undefined;
  
  private static actionHandler:
    | ((
        command: "createSolution" | "runTests" | "submitSolution",
        problem: IncomingProblem,
        language?: string,
      ) => void)
    | undefined;
  private static readonly STATUS_REFRESH_INTERVAL = 15000;
  private static readonly STATUS_STALE_AFTER = 10000;

  private lastStatusRefresh = 0;
  private statusRefreshTimer?: ReturnType<typeof setInterval>;
  private static focusHandler: ((problem: IncomingProblem) => void) | undefined;

  static setFocusHandler(handler: (problem: IncomingProblem) => void): void {
    ProblemPanel.focusHandler = handler;
  }
  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    problemKey: string,
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.currentProblemKey = problemKey;
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (msg) => {
        if (!this.lastProblem || !ProblemPanel.actionHandler) return;
        if (
          msg.command === "createSolution" ||
          msg.command === "runTests" ||
          msg.command === "submitSolution"
        ) {
          ProblemPanel.actionHandler(
            msg.command,
            this.lastProblem,
            msg.language,
          );
        }
      },
      null,
      this.disposables,
    );
    this.panel.onDidChangeViewState(
      (e) => {
        if (e.webviewPanel.active) {
          ProblemPanel.activeKey = this.currentProblemKey;
          this.requestStatusRefresh();
          if (this.lastProblem) ProblemPanel.focusHandler?.(this.lastProblem);
        }
      },
      null,
      this.disposables,
    );

    this.statusRefreshTimer = setInterval(() => {
      if (this.panel.active) {
        this.requestStatusRefresh();
      }
    }, ProblemPanel.STATUS_REFRESH_INTERVAL);
  }

  static setStatusRefreshHandler(
    handler: (problem: IncomingProblem, generation: number) => Promise<void>,
  ): void {
    ProblemPanel.statusRefreshHandler = handler;
  }

  static setActionHandler(
    handler: (
      command: "createSolution" | "runTests" | "submitSolution",
      problem: IncomingProblem,
      language?: string,
    ) => void,
  ): void {
    ProblemPanel.actionHandler = handler;
  }

  private requestStatusRefresh(): void {
    if (!this.lastProblem || !ProblemPanel.statusRefreshHandler) {
      return;
    }

    const isUncached = UNCACHED_STATUSES.has(this.lastStatus);

    if (
      !isUncached &&
      Date.now() - this.lastStatusRefresh < ProblemPanel.STATUS_STALE_AFTER
    ) {
      return;
    }

    this.lastStatusRefresh = Date.now();
    const generation = this.statusGeneration;
    ProblemPanel.statusRefreshHandler(this.lastProblem, generation).catch(
      (err) => {
        console.error(
          `[CF Companion] Failed to refresh status for ${this.currentProblemKey}:`,
          err,
        );
      },
    );
  }

  static getActiveProblem(): IncomingProblem | undefined {
    if (!ProblemPanel.activeKey) {
      return undefined;
    }
    return ProblemPanel.instances.get(ProblemPanel.activeKey)?.lastProblem;
  }

  static show(
    problem: IncomingProblem,
    extensionUri: vscode.Uri,
    status: ProblemStatus = "Not Attempted",
  ): number {
    const key = `${problem.contest_id}/${problem.problem_code}`;
    const column = vscode.window.activeTextEditor?.viewColumn;

    const existing = ProblemPanel.instances.get(key);
    if (existing) {
      existing.panel.reveal(column);
      const generation = existing.update(problem, status);
      ProblemPanel.activeKey = key;
      return generation;
    }

    const panel = vscode.window.createWebviewPanel(
      "cfCompanionProblem",
      problem.problem_code,
      column ?? vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "media")],
      },
    );

    const instance = new ProblemPanel(panel, extensionUri, key);
    ProblemPanel.instances.set(key, instance);
    ProblemPanel.activeKey = key;
    return instance.update(problem, status);
  }
  
  static updateSilently(
    problem: IncomingProblem,
    extensionUri: vscode.Uri,
  ): void {
    const key = `${problem.contest_id}/${problem.problem_code}`;
    const existing = ProblemPanel.instances.get(key);
    if (!existing) return;
    existing.update(problem, existing.lastStatus ?? "Not Attempted");
  }
  
  static refreshStatus(
    contestId: string,
    problemCode: string,
    status: ProblemStatus,
    expectedGeneration?: number,
  ): void {
    const key = `${contestId}/${problemCode}`;
    const instance = ProblemPanel.instances.get(key);
    if (!instance || !instance.lastProblem) {
      return;
    }
    if (
      expectedGeneration !== undefined &&
      expectedGeneration !== instance.statusGeneration
    ) {
      // A newer open/reopen has happened since this refresh was
      // requested — this resolution is stale, drop it.
      return;
    }
    instance.lastStatusRefresh = Date.now();
    const bestStatus = pickBestStatus(instance.lastStatus, status);
    instance.lastStatus = bestStatus;
    instance.setStatus(bestStatus);
  }

  private setStatus(status: ProblemStatus): void {
    this.panel.webview.postMessage({
      command: "statusUpdate",
      status,
    });
  }

  private update(problem: IncomingProblem, status: ProblemStatus): number {
    this.lastProblem = problem;
    
    this.lastStatus = pickBestStatus(this.lastStatus, status);
    const status_ = this.lastStatus;
    this.statusGeneration += 1;
    const generation = this.statusGeneration;
    this.lastStatusRefresh = 0;
    // this.panel.title = `${problem.contest_id}${problem.problem_code} · ${problem.problem_name}`;
    this.panel.title = problem.problem_code;
    this.panel.webview.html = this.render(problem, status_);
    return generation;
  }

  private asset(...segments: string[]): vscode.Uri {
    return this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", ...segments),
    );
  }

  private render(problem: IncomingProblem, status: ProblemStatus): string {
    const { protectedHtml: statementHtml } = protectMath(
      problem.statement_html ?? "",
    );
    const nonce = getNonce();
    const webview = this.panel.webview;

    const katexCssUri = this.asset("katex", "katex.min.css");
    const katexJsUri = this.asset("katex", "katex.min.js");

    const tagsHtml = (problem.tags ?? [])
      .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
      .join("");

    const samplesHtml = (problem.samples ?? [])
      .map(
        (s) => `
        <div class="sample">
          <div class="sample-header">Sample ${s.index}</div>
          <div class="sample-grid">
            <div class="sample-block">
              <div class="sample-label">
                Input
                <button class="copy-btn" data-copy="in-${s.index}">Copy</button>
              </div>
              <pre id="in-${s.index}">${escapeHtml(s.input)}</pre>
            </div>
            <div class="sample-block">
              <div class="sample-label">
                Output
                <button class="copy-btn" data-copy="out-${s.index}">Copy</button>
              </div>
              <pre id="out-${s.index}">${escapeHtml(s.output)}</pre>
            </div>
          </div>
        </div>`,
      )
      .join("");

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${webview.cspSource}; font-src ${webview.cspSource}; img-src https: ${webview.cspSource}; script-src 'nonce-${nonce}' ${webview.cspSource};">
<link rel="stylesheet" href="${katexCssUri}">
<style>${statementCss}</style>
</head>
<body>
  <div class="statement-card">
    <div class="crumb-row">
      <div class="crumb">${escapeHtml(problem.contest_id)} / ${escapeHtml(problem.problem_code)}</div>
      <span id="status-badge-slot">${renderStatusBadge(status)}</span>
    </div>
    <h1 class="title">${escapeHtml(problem.problem_name)}</h1>
    <div class="meta-row">
      <a class="meta-link" href="${escapeAttr(problem.url)}">${escapeHtml(problem.url)}</a>
    </div>
    <div class="cph-actions">
      <select id="langSelect" class="lang-select" title="Language">
        <option value="cpp">C++</option>
        <option value="python">Python</option>
        <option value="java">Java</option>
      </select>
      <button id="createSolutionBtn" class="ghost-btn">Open/Create Solution</button>
      <button id="runTestsBtn" class="ghost-btn">▶ Run Tests</button>
      <button id="submitBtn" class="submit-action-btn">Submit</button>
    </div>
    <div class="limits">
      <div class="limit-box">
        <div class="limit-icon">⏱</div>
        <div class="limit-text">
          <div class="limit-label">Time Limit</div>
          <div class="limit-value">${escapeHtml(problem.time_limit)}</div>
        </div>
      </div>
      <div class="limit-box">
        <div class="limit-icon">💾</div>
        <div class="limit-text">
          <div class="limit-label">Memory Limit</div>
          <div class="limit-value">${escapeHtml(problem.memory_limit)}</div>
        </div>
      </div>
    </div>
    <div class="tags">${tagsHtml}</div>
  </div>

  <div class="statement">${statementHtml}</div>

  <h2 class="section-heading">Samples</h2>
  <div class="samples">
    ${samplesHtml || '<p class="muted"><em>No samples provided.</em></p>'}
  </div>

  <script nonce="${nonce}" src="${katexJsUri}"></script>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    document.getElementById('createSolutionBtn')?.addEventListener('click', () => {
      const lang = document.getElementById('langSelect').value;
      vscode.postMessage({ command: 'createSolution', language: lang });
    });
    document.getElementById('runTestsBtn')?.addEventListener('click', () => {
      vscode.postMessage({ command: 'runTests' });
    });
    document.getElementById('submitBtn')?.addEventListener('click', () => {
      vscode.postMessage({ command: 'submitSolution' });
    });

    document.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const el = document.getElementById(btn.dataset.copy);
        if (!el) return;
        navigator.clipboard.writeText(el.innerText).then(() => {
          const old = btn.textContent;
          btn.textContent = 'Copied!';
          setTimeout(() => (btn.textContent = old), 1000);
        });
      });
    });

    // Each math node carries its own base64-encoded LaTeX source (set server
    // side, see protectMath below) — render each directly instead of
    // re-scanning the DOM for delimiters, which is what CF's own $$$
    // syntax defeats.
    function b64ToUtf8(b64) {
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      return new TextDecoder('utf-8').decode(bytes);
    }

    if (window.katex) {
      document.querySelectorAll('.katex-inline, .katex-block').forEach(el => {
        const b64 = el.getAttribute('data-latex-b64');
        if (!b64) return;
        try {
          const latex = b64ToUtf8(b64);
          katex.render(latex, el, {
            throwOnError: false,
            displayMode: el.classList.contains('katex-block'),
          });
        } catch (e) {
          el.textContent = '[math render error]';
        }
      });
    }

    const STATUS_BADGE_CLASSES = {
      "Accepted": "accepted",
      "Wrong Answer": "wrong-answer",
      "Time Limit": "time-limit",
      "Memory Limit": "memory-limit",
      "Runtime Error": "runtime-error",
      "Compilation Error": "compilation-error",
      "Idleness Limit": "idleness-limit",
      "Challenged": "challenged",
      "Judging…": "judging",
      "Unknown": "unknown",
      "Not Attempted": "not-attempted",
      "Loading": "loading",
      "Pretest Passed": "pretest-passed",
    };

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (!msg || msg.command !== 'statusUpdate') return;
      const slot = document.getElementById('status-badge-slot');
      if (!slot) return;
      const cls = STATUS_BADGE_CLASSES[msg.status];
      const label = msg.status === 'Not Attempted' ? 'NA' : msg.status === 'Loading' ? '⋯' : msg.status;
      slot.innerHTML = cls
        ? \`<span class="status-badge status-\${cls}">\${label}</span>\`
        : '';
    });
  </script>
</body>
</html>`;
  }

  dispose(): void {
    // Only remove this instance if the map still points at it — guards
    // against a stale dispose() firing after this key was already
    // replaced by a newer instance.
    if (ProblemPanel.instances.get(this.currentProblemKey) === this) {
      ProblemPanel.instances.delete(this.currentProblemKey);
    }
    if (ProblemPanel.activeKey === this.currentProblemKey) {
      ProblemPanel.activeKey = undefined;
    }
    if (this.statusRefreshTimer) {
      clearInterval(this.statusRefreshTimer);
      this.statusRefreshTimer = undefined;
    }
    this.panel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}

/**
 * Replaces every math segment in the raw statement HTML in place with a
 * KaTeX target element carrying the LaTeX source (base64-encoded so it
 * survives sitting inside an HTML attribute untouched).
 */
function protectMath(html: string): { protectedHtml: string } {
  const toTarget = (latex: string, display: boolean): string => {
    const encoded = Buffer.from(latex.trim(), "utf8").toString("base64");
    const tag = display ? "div" : "span";
    const cls = display ? "katex-block" : "katex-inline";
    return `<${tag} class="${cls}" data-latex-b64="${escapeAttr(encoded)}"></${tag}>`;
  };

  let result = html;

  result = result.replace(/\\\[([\s\S]+?)\\\]/g, (_m, latex) =>
    toTarget(latex, true),
  );
  result = result.replace(/\\\(([\s\S]+?)\\\)/g, (_m, latex) =>
    toTarget(latex, false),
  );

  result = scanDollarMath(result, toTarget);

  return { protectedHtml: result };
}

function scanDollarMath(
  html: string,
  toTarget: (latex: string, display: boolean) => string,
): string {
  let out = "";
  let i = 0;
  let mode: "inline" | "display" | null = null;
  let spanStart = -1;

  while (i < html.length) {
    if (html[i] !== "$") {
      if (mode === null) {
        out += html[i];
      }
      i++;
      continue;
    }

    let runLength = 0;
    while (html[i + runLength] === "$") {
      runLength++;
    }

    if (mode === null && runLength >= 6) {
      i += 6;
      mode = "display";
      spanStart = i;
    } else if (mode === null && runLength >= 3) {
      i += 3;
      mode = "inline";
      spanStart = i;
    } else if (mode === "inline" && runLength >= 3) {
      out += toTarget(html.slice(spanStart, i), false);
      i += 3;
      mode = null;
    } else if (mode === "display" && runLength >= 6) {
      out += toTarget(html.slice(spanStart, i), true);
      i += 6;
      mode = null;
    } else {
      
      if (mode === null) {
        out += "$".repeat(runLength);
      }
      i += runLength;
    }
  }

  if (mode !== null && spanStart >= 0) {
    
    out += html.slice(spanStart);
  }

  return out;
}

function renderStatusBadge(status: ProblemStatus): string {
  const classMap: Record<ProblemStatus, string> = {
    Accepted: "accepted",
    "Wrong Answer": "wrong-answer",
    "Time Limit": "time-limit",
    "Memory Limit": "memory-limit",
    "Runtime Error": "runtime-error",
    "Compilation Error": "compilation-error",
    "Idleness Limit": "idleness-limit",
    Challenged: "challenged",
    "Judging…": "judging",
    Unknown: "unknown",
    "Not Attempted": "not-attempted",
    Loading: "loading",
    "Pretest Passed": "pretest-passed",
  };

  const label =
    status === "Not Attempted" ? "NA" : status === "Loading" ? "⋯" : status;

  return `<span class="status-badge status-${classMap[status]}">${label}</span>`;
}

function getNonce(): string {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function escapeHtml(s: string): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

const statementCss = `
  body {
    font-family: var(--vscode-font-family, -apple-system, "Segoe UI", sans-serif);
    color: var(--vscode-foreground);
    padding: 28px 32px 60px;
    line-height: 1.65;
    font-size: 14.5px;
    max-width: 860px;
    margin: 0 auto;
  }

  .statement-card {
    padding-bottom: 18px;
    margin-bottom: 24px;
    border-bottom: 1px solid var(--vscode-panel-border);
  }
  .crumb-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 6px;
  }
  .crumb {
    font-size: 0.78em;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--vscode-descriptionForeground);
  }
  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    font-weight: 650;
    letter-spacing: 0.02em;
    padding: 3px 10px;
    border-radius: 20px;
    border: 1px solid currentColor;
    line-height: 1.4;
    white-space: nowrap;
  }
  .status-accepted {
    color: #4caf50;
    background: rgba(76, 175, 80, 0.1);
  }
  .status-pretest-passed {
    color: #8bc34a;
    background: rgba(139, 195, 74, 0.1);
  }
  .status-wrong-answer {
    color: #f44336;
    background: rgba(244, 67, 54, 0.1);
  }
  .status-time-limit,
  .status-memory-limit,
  .status-runtime-error,
  .status-idleness-limit {
    color: #ff9800;
    background: rgba(255, 152, 0, 0.1);
  }
  .status-compilation-error {
    color: #9c27b0;
    background: rgba(156, 39, 176, 0.1);
  }
  .status-challenged {
    color: #e91e63;
    background: rgba(233, 30, 99, 0.1);
  }
  .status-judging {
    color: #2196f3;
    background: rgba(33, 150, 243, 0.1);
  }
  .status-unknown {
    color: #9e9e9e;
    background: rgba(158, 158, 158, 0.1);
  }
  .status-not-attempted {
    color: #888;
    background: rgba(136, 136, 136, 0.1);
  }
  .status-loading {
    color: var(--vscode-descriptionForeground);
    background: var(--vscode-textCodeBlock-background);
    border-color: var(--vscode-panel-border);
  }
  h1.title { font-size: 1.55em; font-weight: 650; margin: 0 0 10px; line-height: 1.3; }
  .meta-row { margin-bottom: 10px; }
  .meta-link {
    color: var(--vscode-textLink-foreground);
    font-size: 0.85em;
    word-break: break-all;
    text-decoration: none;
  }
  .meta-link:hover { text-decoration: underline; }
  .limits { display: flex; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
  .limit-box {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--vscode-textCodeBlock-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 8px;
    padding: 12px 18px;
    min-width: 190px;
  }
  .limit-icon { font-size: 1.6em; line-height: 1; }
  .limit-text { display: flex; flex-direction: column; gap: 2px; }
  .limit-label {
    font-size: 0.75em;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--vscode-descriptionForeground);
  }
  .limit-value { font-size: 1.15em; font-weight: 650; }
  .cph-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 14px;
    flex-wrap: wrap;
  }
  .lang-select {
    background: var(--vscode-dropdown-background);
    color: var(--vscode-dropdown-foreground);
    border: 1px solid var(--vscode-dropdown-border, var(--vscode-panel-border));
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 0.85em;
  }
  .cph-actions button {
    font-family: inherit;
    font-size: 0.85em;
    border-radius: 4px;
    padding: 5px 12px;
    cursor: pointer;
    border: 1px solid transparent;
  }
  .cph-actions .ghost-btn {
    background: transparent;
    color: var(--vscode-foreground);
    border-color: var(--vscode-panel-border);
  }
  .cph-actions .ghost-btn:hover { background: var(--vscode-toolbar-hoverBackground); }
  .cph-actions .submit-action-btn {
    background: var(--vscode-testing-iconPassed, #2ea043);
    color: #fff;
  }
  .cph-actions .submit-action-btn:hover { filter: brightness(1.08); }

  .tags { display: flex; flex-wrap: wrap; gap: 6px; }
  .tag {
    display: inline-block;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    border-radius: 4px;
    padding: 2px 9px;
    font-size: 0.72em;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .statement { margin-bottom: 36px; }
  .statement h1, .statement h2, .statement h3, .statement h4 {
    font-weight: 650;
    margin: 1.6em 0 0.6em;
    line-height: 1.35;
  }
  .statement h1 { font-size: 1.25em; }
  .statement h2 { font-size: 1.15em; }
  .statement h3, .statement h4 { font-size: 1.05em; color: var(--vscode-descriptionForeground); }
  .statement p { margin: 0.9em 0; }
  .statement ul, .statement ol { padding-left: 1.6em; margin: 0.8em 0; }
  .statement li { margin: 0.35em 0; }
  .statement blockquote {
    border-left: 3px solid var(--vscode-textLink-foreground);
    margin: 1em 0;
    padding: 2px 16px;
    color: var(--vscode-descriptionForeground);
    background: var(--vscode-textBlockQuote-background, rgba(127,127,127,0.06));
    border-radius: 0 4px 4px 0;
  }
  .statement img { max-width: 100%; border-radius: 4px; margin: 0.6em 0; }
  .statement table {
    border-collapse: collapse;
    margin: 1em 0;
    width: 100%;
    font-size: 0.92em;
  }
  .statement th, .statement td {
    border: 1px solid var(--vscode-panel-border);
    padding: 6px 10px;
    text-align: left;
  }
  .statement th { background: var(--vscode-textCodeBlock-background); font-weight: 600; }
  .statement code {
    background: var(--vscode-textCodeBlock-background);
    padding: 1.5px 5px;
    border-radius: 3px;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 0.9em;
  }
  .statement pre {
    background: var(--vscode-textCodeBlock-background);
    padding: 12px 14px;
    border-radius: 6px;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 0.88em;
    line-height: 1.5;
  }
  .statement pre code { background: none; padding: 0; }
  .statement hr { border: none; border-top: 1px solid var(--vscode-panel-border); margin: 1.6em 0; }
  .katex { font-size: 1.05em; }
  .katex-display { margin: 1em 0; overflow-x: auto; overflow-y: hidden; }
  .katex-block { display: block; overflow-x: auto; }
  .katex-inline { display: inline; }

  .section-heading {
    font-size: 1.05em;
    font-weight: 650;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--vscode-descriptionForeground);
    margin: 0 0 14px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--vscode-panel-border);
  }

  .samples { display: flex; flex-direction: column; gap: 14px; }
  .sample {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 8px;
    padding: 14px 16px;
    background: var(--vscode-editor-background);
  }
  .sample-header { font-weight: 650; margin-bottom: 10px; font-size: 0.92em; }
  .sample-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  @media (max-width: 560px) { .sample-grid { grid-template-columns: 1fr; } }
  .sample-label {
    display: flex; justify-content: space-between; align-items: center;
    font-size: 0.78em; color: var(--vscode-descriptionForeground);
    margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.03em;
  }
  .sample pre {
    background: var(--vscode-textCodeBlock-background);
    padding: 10px 12px;
    border-radius: 5px;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 0.9em;
    margin: 0;
    max-height: 260px;
    overflow-y: auto;
  }
  .copy-btn {
    background: transparent;
    color: var(--vscode-descriptionForeground);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 3px;
    font-size: 0.85em;
    cursor: pointer;
    padding: 0 8px;
  }
  .copy-btn:hover { background: var(--vscode-toolbar-hoverBackground); color: var(--vscode-foreground); }
  .muted { color: var(--vscode-descriptionForeground); }
`;