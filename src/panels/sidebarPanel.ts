import * as vscode from "vscode";
import { ProblemStorage } from "../storage";
import { ProblemIndex, SidebarHost } from "../types";
import { testPanelCss } from "./testPanel";
import { invalidate as invalidateSubmissionsCache } from "../services/submissionsCache";
import { baseCss } from "./dashboard/styles";
// import { TestPanel } from "./testPanel";
export const SIDEBAR_VIEW_ID = "cfCompanion.sidebarView";

type TabId = "dashboard" |"contests" | "handle" | "tests";

const TAB_ORDER: { id: TabId; label: string }[] = [
  { id: "dashboard", label: "Dashboard"},
  { id: "contests", label: "Contests" },
  { id: "handle", label: "Set Handle" },
  { id: "tests", label: "Tests" },
];

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 32; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function withNonce(html: string, nonce: string): string {
  return html.replace(/<script(?![^>]*\bnonce=)([^>]*)>/g, `<script nonce="${nonce}"$1>`);
}

export class SidebarPanel implements vscode.WebviewViewProvider, SidebarHost {
  private view: vscode.WebviewView | undefined;
  private disposables: vscode.Disposable[] = [];
  private readonly tabMessageHandlers = new Map<TabId, (message: any) => void>();
  private readonly tabContent = new Map<TabId, string>();
  private readonly tabTitles = new Map<TabId, string>();
  private readonly pendingMessages: { tabId: TabId; message: any }[] = [];
  private pendingActiveTab: TabId | undefined;
  private nonce = getNonce();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly storage: ProblemStorage
  ) {
    this.tabContent.set("dashboard",`<div class="empty-state"><div class="empty-title">Opening Dashboard…</div></div>`);
    this.tabContent.set("contests", `<div class="empty-state"><div class="muted">Loading…</div></div>`);
    this.tabContent.set("handle", this.renderHandleTab());
    this.tabContent.set("tests", `<div class="empty-state"><div class="empty-title">No problem open</div><p class="muted">Open a solution file, or use Create Solution from the Contests tab.</p></div>`);

    this.storage.onDidChange(() => this.refreshContestsTab(), null, this.disposables);
  }

  // ---------------- WebviewViewProvider ----------------

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    this.nonce = getNonce();
    webviewView.webview.options = { enableScripts: true, localResourceRoots: [] };

    webviewView.onDidDispose(() => {
      this.view = undefined;
    }, null, this.disposables);

    webviewView.webview.onDidReceiveMessage((msg) => this.handleMessage(msg), null, this.disposables);

    webviewView.webview.html = this.renderShell();

    for (const { tabId, message } of this.pendingMessages.splice(0)) {
      webviewView.webview.postMessage({ tab: tabId, ...message });
    }
    if (this.pendingActiveTab) {
      webviewView.webview.postMessage({ tab: "__shell__", command: "switchTab", tabId: this.pendingActiveTab });
      this.pendingActiveTab = undefined;
    }

    // First-time population: Contests tab data + auto-scroll to whatever
    // problem is currently open.
    void this.refreshContestsTab();
  }

  async saveHandle(trimmed: string): Promise<void> {
    const current = vscode.workspace.getConfiguration().get<string>("cfCompanion.handle", "");
    if (current && current !== trimmed) {
      invalidateSubmissionsCache(current);
    }

    await vscode.workspace
      .getConfiguration()
      .update("cfCompanion.handle", trimmed, vscode.ConfigurationTarget.Global);

    this.refreshHandleTab();
  }

  private handleMessage(msg: any): void {
    if (!msg || typeof msg !== "object") return;
    if (msg.command === "openDashboard") {
      void vscode.commands.executeCommand("cfCompanion.openDashboard");
      return;
    }
    if (msg.command === "openUrl" && typeof msg.url === "string") {
      void vscode.env.openExternal(vscode.Uri.parse(msg.url));
      return;
    }

    if (msg.command === "openProblem" && typeof msg.contestId === "string" && typeof msg.problemCode === "string") {
      void vscode.commands.executeCommand("cfCompanion.openProblem", msg.contestId, msg.problemCode);
      return;
    }

    if (msg.command === "createSolution" && typeof msg.contestId === "string" && typeof msg.problemCode === "string") {
      void vscode.commands.executeCommand("cfCompanion.createSolution", { meta: { contestId: msg.contestId, problemCode: msg.problemCode } });
      return;
    }

    if (msg.command === "openSolution" && typeof msg.contestId === "string" && typeof msg.problemCode === "string") {
      void vscode.commands.executeCommand("cfCompanion.openSolution", { meta: { contestId: msg.contestId, problemCode: msg.problemCode } });
      return;
    }

    if (msg.command === "deleteContest" && typeof msg.contestId === "string") {
      void vscode.commands.executeCommand("cfCompanion.deleteContest", { contestId: msg.contestId });
      return;
    }

    if (msg.command === "refreshContests") {
      void this.refreshContestsTab();
      return;
    }

    if (msg.command === "setHandle") {
      void vscode.commands.executeCommand("cfCompanion.setHandle");
      return;
    }

    if (msg.tab && this.tabMessageHandlers.has(msg.tab)) {
      this.tabMessageHandlers.get(msg.tab)!(msg);
    }
  }

  // ---------------- SidebarHost (consumed by TestPanel) ----------------

  get isResolved(): boolean {
    return this.view !== undefined;
  }

  reveal(tabId: string): void {
    void vscode.commands.executeCommand(`${SIDEBAR_VIEW_ID}.focus`);
    this.switchTab(tabId as TabId);
  }

  setTabContent(tabId: string, html: string): void {
    this.tabContent.set(tabId as TabId, html);
    if (this.view) {
      this.view.webview.postMessage({ tab: "__shell__", command: "setTabContent", tabId, html: withNonce(html, this.nonce) });
    }
  }

  setTabTitle(tabId: string, title: string): void {
    this.tabTitles.set(tabId as TabId, title);
    if (this.view) {
      this.view.webview.postMessage({ tab: "__shell__", command: "setTabTitle", tabId, title });
    }
  }

  postToTab(tabId: string, message: any): void {
    if (this.view) {
      this.view.webview.postMessage({ tab: tabId, ...message });
    } else {
      this.pendingMessages.push({ tabId: tabId as TabId, message });
    }
  }

  onTabMessage(tabId: string, handler: (message: any) => void): void {
    this.tabMessageHandlers.set(tabId as TabId, handler);
  }

  private switchTab(tabId: TabId): void {
    if (this.view) {
      this.view.webview.postMessage({ tab: "__shell__", command: "switchTab", tabId });
    } else {
      this.pendingActiveTab = tabId;
    }
  }

  // ---------------- Contests tab ----------------

  async refreshContestsTab(): Promise<void> {
    const index = await this.storage.getIndex();
    const activeKey = this.currentlyOpenProblemKey();
    const html = this.renderContestsTab(index, activeKey);
    this.setTabContent("contests", html);
  }

  private currentlyOpenProblemKey(): string | undefined {
    return SidebarPanel.activeProblemKeyProvider?.();
  }

  static activeProblemKeyProvider: (() => string | undefined) | undefined;

  private renderContestsTab(index: ProblemIndex, activeKey: string | undefined): string {
    const entries = Object.values(index).sort((a, b) => Number(b.contestId) - Number(a.contestId));

    if (!entries.length) {
      return /* html */ `
        <div class="empty-state">
          <div class="empty-icon">📄</div>
          <div class="empty-title">No problems yet</div>
          <p class="muted">Problems sent from the parser script will show up here.</p>
        </div>`;
    }

    const body = entries
      .map((entry) => {
        const problems = entry.problems
          .slice()
          .sort((a, b) => a.problemCode.localeCompare(b.problemCode))
          .map((p) => {
            const key = `${p.contestId}/${p.problemCode}`;
            const isActive = key === activeKey;
            return /* html */ `
              <div class="cp-problem-row${isActive ? " cp-active" : ""}" data-contest="${escapeHtml(p.contestId)}" data-problem="${escapeHtml(p.problemCode)}" tabindex="0">
                <span class="cp-problem-code">${escapeHtml(p.problemCode)}</span>
                <span class="cp-problem-name">${escapeHtml(p.problemName)}</span>
                ${p.tags.length ? `<span class="cp-problem-tags">${escapeHtml(p.tags.slice(0, 3).join(", "))}</span>` : ""}
                <button class="cp-row-action-btn cp-open-solution-btn" data-contest="${escapeHtml(p.contestId)}" data-problem="${escapeHtml(p.problemCode)}" title="Open solution file">${p.solutionPath ? "→" : ""}</button>
                <button class="cp-row-action-btn cp-create-solution-btn" data-contest="${escapeHtml(p.contestId)}" data-problem="${escapeHtml(p.problemCode)}" title="Create solution">+</button>
              </div>`;
          })
          .join("");

        const hasActiveChild = entry.problems.some((p) => `${p.contestId}/${p.problemCode}` === activeKey);

        return /* html */ `
          <details class="cp-contest" ${hasActiveChild ? "open" : ""} data-contest-group="${escapeHtml(entry.contestId)}">
            <summary>
              <span class="cp-contest-title">Contest ${escapeHtml(entry.contestId)}</span>
              <span class="cp-contest-count">${entry.problems.length}</span>
              <button class="cp-delete-btn" data-contest="${escapeHtml(entry.contestId)}" title="Delete contest">✕</button>
            </summary>
            <div class="cp-problem-list">${problems}</div>
          </details>`;
      })
      .join("");

    return /* html */ `
      <div class="cp-toolbar">
        <button id="cpRefreshBtn" class="ghost-btn" title="Refresh problem list">⟳ Refresh</button>
      </div>
      <div class="cp-list" id="cpList">${body}</div>
      <script>
      (function(){
        const vscode = TestPanel.vscodeApi;
        const root = document.getElementById('cpList');

        function bind(root) {
          root.querySelectorAll('.cp-problem-row').forEach((row) => {
            const open = () => vscode.postMessage({ command: 'openProblem', contestId: row.dataset.contest, problemCode: row.dataset.problem });
            row.addEventListener('click', open);
            row.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
          });
          root.querySelectorAll('.cp-open-solution-btn').forEach((btn) => {
            btn.addEventListener('click', (e) => {
              e.stopPropagation();
              vscode.postMessage({ command: 'openSolution', contestId: btn.dataset.contest, problemCode: btn.dataset.problem });
            });
          });
          root.querySelectorAll('.cp-create-solution-btn').forEach((btn) => {
            btn.addEventListener('click', (e) => {
              e.stopPropagation();
              vscode.postMessage({ command: 'createSolution', contestId: btn.dataset.contest, problemCode: btn.dataset.problem });
            });
          });
          root.querySelectorAll('.cp-delete-btn').forEach((btn) => {
            btn.addEventListener('click', (e) => {
              e.stopPropagation();
              vscode.postMessage({ command: 'deleteContest', contestId: btn.dataset.contest });
            });
          });
        }
        bind(root);

        document.getElementById('cpRefreshBtn').addEventListener('click', () => {
          vscode.postMessage({ command: 'refreshContests' });
        });

        // Scroll the active problem (if any) into view on first render of this tab.
        const active = root.querySelector('.cp-active');
        if (active) active.scrollIntoView({ block: 'center' });
      })();
      </script>`;
  }

  // ---------------- Set Handle tab ----------------

  private renderHandleTab(): string {
    const current = vscode.workspace.getConfiguration().get<string>("cfCompanion.handle", "");
    return /* html */ `
      <div class="handle-tab">
        <div class="empty-icon">👤</div>
        <div class="empty-title">Codeforces handle</div>
        <p class="muted">${current ? `Currently set to <strong>${escapeHtml(current)}</strong>.` : "Not set yet."}</p>
        <button id="setHandleBtn" class="primary-btn">${current ? "Change Handle" : "Set Handle"}</button>
      </div>
      <script>
      (function(){
        const vscode = TestPanel.vscodeApi;
        document.getElementById('setHandleBtn').addEventListener('click', () => {
          vscode.postMessage({ command: 'setHandle' });
        });
      })();
      </script>`;
  }

  refreshHandleTab(): void {
    this.setTabContent("handle", this.renderHandleTab());
  }

  private renderShell(): string {
    const webview = this.view!.webview;
    const nonce = this.nonce;

    const tabButtons = TAB_ORDER.map(
      (t) => `<button class="tab-btn" data-tab="${t.id}" id="tabbtn-${t.id}">${escapeHtml(this.tabTitles.get(t.id) ?? t.label)}</button>`
    ).join("");

    const tabPanes = TAB_ORDER.map(
      (t) => `<div class="tab-pane" id="tab-${t.id}" data-tab-pane="${t.id}">${withNonce(this.tabContent.get(t.id) ?? "", nonce)}</div>`
    ).join("");

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}' ${webview.cspSource};">
<style>
${shellCss}
${testPanelCss}
${baseCss}
</style>
</head>
<body>
  <script nonce="${nonce}">
    (function(){
      window.TestPanel = {
        vscodeApi: acquireVsCodeApi(),
        onTabMessage: function (tabId, handler) {
          window.__tabMessageHandlers = window.__tabMessageHandlers || {};
          window.__tabMessageHandlers[tabId] = handler;
        },
      };
    })();
  </script>
  <div class="tab-strip" id="tabStrip">${tabButtons}</div>
  <div class="tab-content" id="tabContent">${tabPanes}</div>
  <script nonce="${nonce}">
    (function(){
      const vscodeApi = TestPanel.vscodeApi;

      function switchTab(tabId) {
        document.querySelectorAll('.tab-btn').forEach((btn) => {
          btn.classList.toggle('active', btn.dataset.tab === tabId);
        });
        document.querySelectorAll('.tab-pane').forEach((pane) => {
          pane.classList.toggle('active', pane.dataset.tabPane === tabId);
        });
        vscodeApi.setState({ activeTab: tabId });
      }

      document.querySelectorAll('.tab-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const tabId = btn.dataset.tab;

          if (tabId === 'dashboard') {
            vscodeApi.postMessage({ command: 'openDashboard' });
            return;
          }

          switchTab(tabId);
        });
      });

      const restored = vscodeApi.getState();
      switchTab((restored && restored.activeTab) || '${TAB_ORDER[0].id}');

      window.addEventListener('message', (event) => {
        const msg = event.data;
        if (!msg) return;

        if (msg.tab === '__shell__') {
          if (msg.command === 'switchTab') {
            switchTab(msg.tabId);
          } else if (msg.command === 'setTabContent') {
            const pane = document.querySelector('[data-tab-pane="' + msg.tabId + '"]');
            if (pane) {
              // Scripts assigned via innerHTML never execute (DOM spec),
              // independent of the ordering bug fixed above — this is a
              // second, separate reason a tab's script needs explicit
              // re-execution any time its content is replaced after
              // initial load (e.g. Contests refreshing, Tests switching
              // problems). Cloning forces the browser to treat it as a
              // freshly-inserted node and run it; window.TestPanel is
              // already defined by now regardless of when this fires, so
              // no ordering issue here.
              pane.innerHTML = msg.html;
              pane.querySelectorAll('script').forEach((oldScript) => {
                const newScript = document.createElement('script');
                newScript.setAttribute('nonce', '${nonce}');
                newScript.textContent = oldScript.textContent;
                oldScript.replaceWith(newScript);
              });
            }
          } else if (msg.command === 'setTabTitle') {
            const btn = document.getElementById('tabbtn-' + msg.tabId);
            if (btn) btn.textContent = msg.title;
          }
          return;
        }

        const handlers = window.__tabMessageHandlers || {};
        const handler = handlers[msg.tab];
        if (handler) handler(msg);
      });
    })();
  </script>
</body>
</html>`;
  }

  dispose(): void {
    while (this.disposables.length) this.disposables.pop()?.dispose();
  }
}

const shellCss = `
  html, body {
    height: 100%;
    margin: 0;
    padding: 0;
    overflow: hidden;
  }

  body {
    display: flex;
    flex-direction: column;
    font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
    color: var(--vscode-foreground);
    background: var(--vscode-sideBar-background, var(--vscode-editor-background));
    font-size: 12.5px;
  }

  .tab-strip {
    display: flex;
    flex-shrink: 0;
    border-bottom: 1px solid var(--vscode-panel-border);
    background: var(--vscode-sideBar-background, var(--vscode-editor-background));
  }

  .tab-btn {
    flex: 1 1 0;
    min-width: 0;
    padding: 7px 4px;
    background: transparent;
    color: var(--vscode-descriptionForeground);
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    font-size: 0.82em;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tab-btn:hover {
    color: var(--vscode-foreground);
    background: var(--vscode-list-hoverBackground);
  }

  .tab-btn.active {
    color: var(--vscode-foreground);
    border-bottom-color: var(--vscode-focusBorder, var(--vscode-textLink-foreground));
  }

  .tab-content {
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
    position: relative;
  }

  .tab-pane {
    display: none;
    flex-direction: column;
    height: 100%;
    box-sizing: border-box;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .tab-pane.active {
    display: flex;
  }

  /* ---------- Contests tab ---------- */

  .cp-toolbar {
    display: flex;
    justify-content: flex-end;
    padding: 6px 8px;
    border-bottom: 1px solid var(--vscode-panel-border);
    flex-shrink: 0;
  }

  .cp-list {
    overflow-y: auto;
    flex: 1 1 auto;
  }

  .cp-contest summary {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    cursor: pointer;
    list-style: none;
  }

  .cp-contest summary::-webkit-details-marker { display: none; }

  .cp-contest-title {
    font-weight: 650;
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cp-contest-count {
    color: var(--vscode-descriptionForeground);
    font-size: 0.85em;
  }

  .cp-delete-btn {
    background: transparent;
    border: none;
    color: var(--vscode-descriptionForeground);
    cursor: pointer;
    padding: 2px 4px;
    visibility: hidden;
  }

  .cp-contest:hover .cp-delete-btn { visibility: visible; }
  .cp-delete-btn:hover { color: var(--vscode-errorForeground); }

  .cp-problem-list {
    display: flex;
    flex-direction: column;
  }

  .cp-problem-row {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 5px 10px 5px 22px;
    cursor: pointer;
  }

  .cp-problem-row:hover, .cp-problem-row:focus {
    background: var(--vscode-list-hoverBackground);
    outline: none;
  }

  .cp-problem-row.cp-active {
    background: var(--vscode-list-activeSelectionBackground);
    color: var(--vscode-list-activeSelectionForeground);
  }

  .cp-problem-code {
    font-weight: 650;
    flex-shrink: 0;
  }

  .cp-problem-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cp-problem-tags {
    color: var(--vscode-descriptionForeground);
    font-size: 0.82em;
    flex-shrink: 0;
  }

  .cp-row-action-btn {
    background: transparent;
    border: none;
    color: var(--vscode-descriptionForeground);
    cursor: pointer;
    padding: 2px 5px;
    font-size: 0.9em;
    visibility: hidden;
    flex-shrink: 0;
  }

  .cp-problem-row:hover .cp-row-action-btn,
  .cp-problem-row:focus .cp-row-action-btn {
    visibility: visible;
  }

  .cp-row-action-btn:hover {
    color: var(--vscode-foreground);
  }

  /* ---------- Set Handle tab ---------- */

  .handle-tab {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: 6px;
    padding: 40px 20px;
    flex: 1 1 auto;
  }
`;