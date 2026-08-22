import { IncomingProblem, TestCase, TestResult, SidebarHost } from "../types";

function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeLine(line: string): string {
  return line.replace(/[ \t]+$/g, "");
}


const DRAFT_SCRIPT_CORE = /* js */ `
  function escHtml(s) {
    const div = document.createElement('div');
    div.textContent = s ?? '';
    return div.innerHTML;
  }

  function buildDraftRowHtml(prefillInput, prefillExpected) {
    return '<div class="test-row status-pending draft-row expanded">'
      + '<div class="test-header">'
      + '<span class="chevron">›</span>'
      + '<span class="status-icon" title="Not run">○</span>'
      + '<span class="test-label">New test</span>'
      + '<span class="test-time"></span>'
      + '</div>'
      + '<div class="test-detail">'
      + '<div class="edit-mode" style="display:block">'
      + '<div class="io-grid-2">'
      + '<div class="io-block"><div class="io-label">Input</div>'
      + '<textarea class="input-edit" spellcheck="false" placeholder="Test input">' + escHtml(prefillInput) + '</textarea></div>'
      + '<div class="io-block"><div class="io-label">Expected output</div>'
      + '<textarea class="expected-edit" spellcheck="false" placeholder="Expected output">' + escHtml(prefillExpected) + '</textarea></div>'
      + '</div>'
      + '<div class="edit-actions">'
      + '<button class="save-draft-btn ghost-btn primary-btn">Save</button>'
      + '<button class="cancel-draft-btn ghost-btn">Discard</button>'
      + '</div></div></div></div>';
  }

  function bindTestListEvents(root) {
    root.querySelectorAll('.delete-test-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        vscode.postMessage({ tab: 'tests', command: 'deleteCustomTest', testId: btn.dataset.testId });
      });
    });

    root.querySelectorAll('.run-test-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        vscode.postMessage({ tab: 'tests', command: 'runTests', testId: btn.dataset.testId });
      });
    });

    root.querySelectorAll('.test-header').forEach(header => {
      header.addEventListener('click', (e) => {
        if (e.target.closest('.delete-test-btn, .run-test-btn, .edit-test-btn, .dup-test-btn')) return;
        header.closest('.test-row').classList.toggle('expanded');
      });
    });

    root.querySelectorAll('.dup-test-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const row = btn.closest('.test-row');
        const input = row.querySelector('.input-view')?.textContent ?? '';
        const expected = row.querySelector('.expected-view')?.textContent ?? '';
        addDraftCard(input, expected, row);
      });
    });

    root.querySelectorAll('.edit-test-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const row = btn.closest('.test-row');
        row.classList.add('expanded');
        row.querySelector('.view-mode').style.display = 'none';
        row.querySelector('.edit-mode').style.display = 'block';
        row.querySelector('.input-edit')?.focus();
      });
    });

    root.querySelectorAll('.cancel-edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const row = btn.closest('.test-row');
        // Reset any unsaved typing back to the last-saved content.
        row.querySelector('.input-edit').value = row.querySelector('.input-view')?.textContent ?? '';
        row.querySelector('.expected-edit').value = row.querySelector('.expected-view')?.textContent ?? '';
        row.querySelector('.edit-mode').style.display = 'none';
        row.querySelector('.view-mode').style.display = 'block';
      });
    });

    root.querySelectorAll('.save-edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const row = btn.closest('.test-row');
        const input = row.querySelector('.input-edit').value;
        const expected = row.querySelector('.expected-edit').value;
        vscode.postMessage({ tab: 'tests', command: 'updateTest', testId: btn.dataset.testId, input, expectedOutput: expected });
      });
    });
  }

  /**
   * Inserts a blank (or duplicate-prefilled) editable card into the test
   * list, right after \`afterRow\` if given, otherwise at the end. Purely
   * client-side — nothing is sent to the extension host until Save.
   */
  function addDraftCard(prefillInput, prefillExpected, afterRow) {
    const list = document.getElementById('testList');
    if (!list) return;
    // Only one draft at a time — creating a second would leave the first
    // one's typed content stranded with no way back to it.
    const existingDraft = list.querySelector('.draft-row');
    if (existingDraft) {
      existingDraft.scrollIntoView({ block: 'center', behavior: 'smooth' });
      existingDraft.querySelector('.input-edit')?.focus();
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.innerHTML = buildDraftRowHtml(prefillInput || '', prefillExpected || '').trim();
    const draftEl = wrapper.firstElementChild;

    if (afterRow && afterRow.nextSibling) {
      list.insertBefore(draftEl, afterRow.nextSibling);
    } else if (afterRow) {
      list.appendChild(draftEl);
    } else {
      list.insertBefore(draftEl, list.firstChild);
    }

    bindDraftCard(draftEl);
    draftEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
    draftEl.querySelector('.input-edit')?.focus();
  }

  function bindDraftCard(draftEl) {
    draftEl.querySelector('.save-draft-btn').addEventListener('click', () => {
      const input = draftEl.querySelector('.input-edit').value;
      const expected = draftEl.querySelector('.expected-edit').value;
      vscode.postMessage({ tab: 'tests', command: 'saveNewTest', input, expectedOutput: expected });
    });
    draftEl.querySelector('.cancel-draft-btn').addEventListener('click', () => {
      draftEl.remove();
    });
  }
`;

function renderDiffLines(expected: string, actual: string): string {
  const expectedLines = expected.replace(/\r\n/g, "\n").replace(/\n+$/, "").split("\n");
  const actualLines = actual.replace(/\r\n/g, "\n").replace(/\n+$/, "").split("\n");
  const maxLines = Math.max(expectedLines.length, actualLines.length);

  const rendered: string[] = [];
  for (let i = 0; i < maxLines; i++) {
    const actualLine = actualLines[i] ?? "";
    const expectedLine = expectedLines[i] ?? "";
    const matches = normalizeLine(actualLine) === normalizeLine(expectedLine);
    rendered.push(
      `<span class="diff-line ${matches ? "diff-match" : "diff-mismatch"}">${escapeHtml(actualLine)}</span>`
    );
  }
  return rendered.join("\n");
}

export interface TestPanelState {
  problem: IncomingProblem;
  tests: TestCase[];
  results: Map<string, TestResult>;
  compilerConfigured: boolean;
  availableCompilers: string[];
  selectedCompiler: string;
}

export class TestPanel {
  private static current: TestPanel | undefined;
 
  private static host: SidebarHost | undefined;
  private state: TestPanelState | undefined;

  static onRunTests: ((problemKey: string, testId?: string) => void) | undefined;
  static onDeleteCustomTest: ((problemKey: string, testId: string) => void) | undefined;
  static onSubmit: ((problemKey: string, compiler: string) => void) | undefined;
  
  static onSaveNewTest: ((problemKey: string, input: string, expectedOutput: string) => void) | undefined;
  
  static onUpdateTest: ((problemKey: string, testId: string, input: string, expectedOutput: string) => void) | undefined;

  private constructor() {}

  static configureHost(host: SidebarHost): void {
    TestPanel.host = host;
    TestPanel.current = new TestPanel();
    host.onTabMessage("tests", (msg) => TestPanel.current!.handleMessage(msg));
  }

  private handleMessage(msg: any): void {
    if (!this.state) return;
    const key = `${this.state.problem.contest_id}/${this.state.problem.problem_code}`;

    if (msg.command === "runTests") TestPanel.onRunTests?.(key, msg.testId);
    else if (msg.command === "deleteCustomTest") TestPanel.onDeleteCustomTest?.(key, msg.testId);
    else if (msg.command === "submit") TestPanel.onSubmit?.(key, msg.compiler ?? this.state.selectedCompiler);
    else if (msg.command === "saveNewTest") TestPanel.onSaveNewTest?.(key, msg.input ?? "", msg.expectedOutput ?? "");
    else if (msg.command === "updateTest") TestPanel.onUpdateTest?.(key, msg.testId, msg.input ?? "", msg.expectedOutput ?? "");
  }

  static show(): TestPanel {
    if (!TestPanel.host || !TestPanel.current) {
      throw new Error("TestPanel.configureHost(host) must be called during activation before show().");
    }
    TestPanel.host.reveal("tests");
    return TestPanel.current;
  }

  static get isOpen(): boolean {
    return !!TestPanel.host?.isResolved;
  }

  static close(): void {
    if (!TestPanel.host || !TestPanel.current) return;
    TestPanel.current.state = undefined;
    TestPanel.host.setTabContent("tests", TestPanel.current.renderCompilerNotConfiguredInline("No problem open."));
  }

  setState(state: TestPanelState): void {
    this.state = state;
    TestPanel.host?.setTabTitle("tests", `Tests · ${state.problem.problem_code}`);
    TestPanel.host?.setTabContent("tests", this.render(state));
  }

  patchProblem(state: TestPanelState): void {
    const cameFromTestList = !!this.state?.compilerConfigured && !!this.state?.tests.length;
    const goingToTestList = state.compilerConfigured && state.tests.length > 0;

    if (!cameFromTestList || !goingToTestList) {
      this.setState(state);
      return;
    }

    this.state = state;
    TestPanel.host?.setTabTitle("tests", `Tests · ${state.problem.problem_code}`);
    const rows = state.tests.map((t) => this.renderTestRow(t, state.results.get(t.id))).join("");

    TestPanel.host?.postToTab("tests", {
      command: "problemUpdate",
      crumb: `${escapeHtml(state.problem.contest_id)}${escapeHtml(state.problem.problem_code)}`,
      rows,
      compilerOptions: this.renderCompilerOptions(state),
    });
  }

  patchResult(result: TestResult): void {
    if (!this.state) return;
    this.state.results.set(result.testId, result);
    const test = this.state.tests.find((t) => t.id === result.testId);
    const diffHtml =
      result.status === "fail" && test ? renderDiffLines(test.expectedOutput, result.actualOutput ?? "") : undefined;
    TestPanel.host?.postToTab("tests", { command: "resultUpdate", result: serializeResult(result), diffHtml });
  }

  requestNewDraft(): void {
    TestPanel.host?.postToTab("tests", { command: "requestNewDraft" });
  }

  updateCompilers(compilers: string[]): void {
    if (!this.state || !compilers.length) return;
    this.state.availableCompilers = compilers;
    if (!compilers.includes(this.state.selectedCompiler)) {
      this.state.selectedCompiler = compilers[0];
    }
    TestPanel.host?.postToTab("tests", {
      command: "compilerListUpdate",
      compilers,
      options: compilers
        .map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
        .join(""),
    });
  }

  private renderCompilerOptions(state: TestPanelState): string {
    const list = state.availableCompilers.length ? state.availableCompilers : [state.selectedCompiler];
    return list
      .map(
        (c) =>
          `<option value="${escapeHtml(c)}" ${c === state.selectedCompiler ? "selected" : ""}>${escapeHtml(c)}</option>`
      )
      .join("");
  }

  private render(state: TestPanelState): string {
    if (!state.compilerConfigured) {
      return this.renderCompilerNotConfiguredInline();
    }

    if (!state.tests.length) {
      return this.renderEmptyInline(state);
    }

    const rows = state.tests.map((t) => this.renderTestRow(t, state.results.get(t.id))).join("");

    return /* html */ `
    <div class="toolbar">
    <div class="test-list" id="testList">${rows}</div>
  <div class="toolbar-row1">
    <div class="crumb">${escapeHtml(state.problem.contest_id)}${escapeHtml(state.problem.problem_code)}</div>
  </div>
  <select id="compilerSelect" class="ghost-btn" title="Compiler to submit with">${this.renderCompilerOptions(state)}</select>
  <div class="toolbar-row2">
    <button id="addTestBtn" class="ghost-btn" title="Add custom test">+ Test</button>
    <button id="runBtn" class="primary-btn" title="Run all tests">▶ Run</button>
    <button id="submitBtn" class="submit-btn" title="Submit solution">Submit</button>
  </div>
</div>
  <script>
  (function(){
    const vscode = TestPanel.vscodeApi;
    ${DRAFT_SCRIPT_CORE}

    document.getElementById('runBtn').addEventListener('click', () => vscode.postMessage({ tab: 'tests', command: 'runTests' }));
    document.getElementById('addTestBtn').addEventListener('click', () => addDraftCard());
    document.getElementById('submitBtn').addEventListener('click', () => {
      const compiler = document.getElementById('compilerSelect')?.value;
      vscode.postMessage({ tab: 'tests', command: 'submit', compiler });
    });

    bindTestListEvents(document.getElementById('testList'));

    const STATUS_META = {
      pending: { icon: '○', cls: 'pending', label: 'Not run' },
      running: { icon: '◐', cls: 'running', label: 'Running…' },
      pass: { icon: '✓', cls: 'pass', label: 'Passed' },
      fail: { icon: '✗', cls: 'fail', label: 'Failed' },
      error: { icon: '!', cls: 'error', label: 'Error' },
      timeout: { icon: '⏱', cls: 'timeout', label: 'Timeout' },
    };

    TestPanel.onTabMessage('tests', (msg) => {
      if (msg && msg.command === 'requestNewDraft') {
        addDraftCard();
        return;
      }
      if (msg && msg.command === 'problemUpdate') {
        const crumbEl = document.querySelector('#tab-tests .crumb');
        if (crumbEl) crumbEl.textContent = msg.crumb;

        const testList = document.getElementById('testList');
        if (testList) {
          testList.innerHTML = msg.rows;
          bindTestListEvents(testList);
        }

        const select = document.getElementById('compilerSelect');
        if (select) select.innerHTML = msg.compilerOptions;
        return;
      }
      if (msg && msg.command === 'compilerListUpdate') {
        const select = document.getElementById('compilerSelect');
        if (!select) return;
        const previous = select.value;
        select.innerHTML = msg.options;
        if (msg.compilers.includes(previous)) select.value = previous;
        return;
      }
      if (!msg || msg.command !== 'resultUpdate') return;
      const r = msg.result;
      const row = document.querySelector('.test-row[data-test-id="' + r.testId + '"]');
      if (!row) return;

      const meta = STATUS_META[r.status] || STATUS_META.pending;
      row.className = 'test-row status-' + meta.cls + (r.status !== 'pass' ? ' expanded' : '');

      const badge = row.querySelector('.status-icon');
      badge.textContent = meta.icon;
      badge.title = meta.label;

      const timeEl = row.querySelector('.test-time');
      timeEl.textContent = r.timeMs !== undefined ? r.timeMs + ' ms' : '';

      const actualEl = row.querySelector('.actual-output');
      if (actualEl) {
        if (msg.diffHtml) {
          actualEl.innerHTML = msg.diffHtml;
        } else {
          actualEl.textContent = r.actualOutput ?? '';
        }
      }

      const errEl = row.querySelector('.error-output');
      if (errEl) {
        const errText = r.errorMessage || r.stderr || '';
        errEl.textContent = errText;
        errEl.style.display = errText ? 'block' : 'none';
      }
    });
  })();
  </script>`;
  }

  private renderTestRow(test: TestCase, result: TestResult | undefined): string {
    const status = result?.status ?? "pending";
    const icon = { pending: "○", running: "◐", pass: "✓", fail: "✗", error: "!", timeout: "⏱" }[status];
    const label = test.origin === "sample" ? `Sample ${test.id.replace("sample-", "")}` : "Custom test";
    const timeLabel = result?.timeMs !== undefined ? `${result.timeMs} ms` : "";
    const errText = result?.errorMessage || result?.stderr || "";
    const actual = result?.actualOutput ?? "";
    const showDiff = status === "fail";
    
    const defaultExpanded = status !== "pass";
    const isCustom = test.origin === "custom";

    return /* html */ `
      <div class="test-row status-${status}${defaultExpanded ? " expanded" : ""}" data-test-id="${escapeHtml(test.id)}">
        <div class="test-header">
          <span class="chevron">›</span>
          <span class="status-icon" title="${status}">${icon}</span>
          <span class="test-label">${escapeHtml(label)}</span>
          <span class="test-time">${timeLabel}</span>
          <button class="run-test-btn" data-test-id="${escapeHtml(test.id)}" title="Run this test">▶</button>
          <button class="dup-test-btn" data-test-id="${escapeHtml(test.id)}" title="Duplicate as new test">⧉</button>
          ${
            isCustom
              ? `<button class="edit-test-btn" data-test-id="${escapeHtml(test.id)}" title="Edit test">✎</button>
                 <button class="delete-test-btn" data-test-id="${escapeHtml(test.id)}" title="Delete test">✕</button>`
              : ""
          }
        </div>
        <div class="test-detail">
          <div class="view-mode">
            <div class="io-grid">
              <div class="io-block">
                <div class="io-label">Input</div>
                <pre class="input-view">${escapeHtml(test.input)}</pre>
              </div>
              <div class="io-block">
                <div class="io-label">Expected</div>
                <pre class="expected-view">${escapeHtml(test.expectedOutput)}</pre>
              </div>
              <div class="io-block">
                <div class="io-label">Actual</div>
                <pre class="actual-output">${
                  showDiff ? renderDiffLines(test.expectedOutput, actual) : escapeHtml(actual)
                }</pre>
              </div>
            </div>
            <pre class="error-output" style="display:${errText ? "block" : "none"}">${escapeHtml(errText)}</pre>
          </div>
          <div class="edit-mode" style="display:none">
            <div class="io-grid-2">
              <div class="io-block">
                <div class="io-label">Input</div>
                <textarea class="input-edit" spellcheck="false" placeholder="Test input">${escapeHtml(test.input)}</textarea>
              </div>
              <div class="io-block">
                <div class="io-label">Expected output</div>
                <textarea class="expected-edit" spellcheck="false" placeholder="Expected output">${escapeHtml(test.expectedOutput)}</textarea>
              </div>
            </div>
            <div class="edit-actions">
              <button class="save-edit-btn ghost-btn primary-btn" data-test-id="${escapeHtml(test.id)}">Save</button>
              <button class="cancel-edit-btn ghost-btn">Cancel</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  private renderEmptyInline(state: TestPanelState): string {
    return /* html */ `
      <div class="test-list" id="testList"></div>
      <div class="empty-state" id="emptyState">
        <div class="empty-icon">⌗</div>
        <div class="empty-title">No tests yet</div>
        <p class="muted">This problem has no sample tests. Add a custom test to get started.</p>
        <button id="addTestBtn" class="primary-btn">+ Add Test</button>
      </div>
      <script>
      (function(){
        const vscode = TestPanel.vscodeApi;
        ${DRAFT_SCRIPT_CORE}
        document.getElementById('addTestBtn').addEventListener('click', () => {
          document.getElementById('emptyState').style.display = 'none';
          document.getElementById('testList').style.display = 'flex';
          addDraftCard();
        });

        TestPanel.onTabMessage('tests', (msg) => {
          if (msg && msg.command === 'requestNewDraft') {
            document.getElementById('emptyState').style.display = 'none';
            document.getElementById('testList').style.display = 'flex';
            addDraftCard();
          }
        });
      })();
      </script>`;
  }

  private renderCompilerNotConfiguredInline(message?: string): string {
    return /* html */ `
      <div class="empty-state">
        <div class="empty-icon">⚠</div>
        <div class="empty-title">${message ? escapeHtml(message) : "Compiler not configured"}</div>
        ${
          message
            ? ""
            : `<p class="muted">Set the compiler/interpreter path for this language in Settings (search "CF Companion"), then run tests again.</p>`
        }
      </div>`;
  }
}

function serializeResult(result: TestResult) {
  return result;
}

export const testPanelCss = `
 /* =========================================================
   BASE
   ========================================================= */

body {
  font-family: var(
    --vscode-font-family,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif
  );

  color: var(--vscode-foreground);
  background: var(--vscode-editor-background);

  margin: 0;
  font-size: 12.5px;

  height: 100vh;

  display: flex;
  flex-direction: column;

  overflow: hidden;
}


/* =========================================================
   TOOLBAR
   ========================================================= */

.toolbar {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  flex-shrink: 0;
  background: var(--vscode-editor-background);
  border-bottom: 1px solid var(--vscode-panel-border);
  position: sticky;   /* add */
  bottom: 0;           /* add */
  z-index: 1;
}

.toolbar-row1,
.toolbar-row2 {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: wrap;
}

.toolbar-row1 .crumb {
  flex: 1 1 0;
  min-width: 0;
}

.toolbar-row2 button {
  flex: 1 1 60px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.crumb {
  font-weight: 650;
  font-size: 0.85em;
  letter-spacing: 0.02em;
  color: var(--vscode-descriptionForeground);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}


/* =========================================================
   COMPILER SELECT
   ========================================================= */

#compilerSelect {
  display: block;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  appearance: auto;
  background: var(--vscode-dropdown-background, var(--vscode-input-background));
  color: var(--vscode-dropdown-foreground, var(--vscode-input-foreground));
  border: 1px solid var(--vscode-dropdown-border, var(--vscode-input-border, var(--vscode-panel-border)));
  border-radius: 1px;
  padding: 5px 8px;
  height: 29px;
  cursor: pointer;
  font-family: inherit;
  font-size: 0.85em;
}

#compilerSelect:hover {
  border-color: var(--vscode-focusBorder);
}

#compilerSelect:focus {
  outline: 1px solid var(--vscode-focusBorder);
  outline-offset: -1px;
}

#compilerSelect option {
  background: var(
    --vscode-dropdown-background,
    var(--vscode-input-background)
  );

  color: var(
    --vscode-dropdown-foreground,
    var(--vscode-input-foreground)
  );
}


/* =========================================================
   ALL BUTTONS
   ========================================================= */

button {
  font-family: inherit;
  font-size: 0.85em;
  cursor: pointer;
  border-radius: 1px;
  padding: 5px 10px;
  min-height: 28px;
  border: 1px solid var(--vscode-panel-border);
  box-sizing: border-box;
  transition:
    background-color 0.1s ease,
    border-color 0.1s ease,
    color 0.1s ease;
}

button:disabled {
  opacity: 0.5;
  cursor: default;
}


/* =========================================================
   SECONDARY BUTTON
   ========================================================= */

.ghost-btn {
  background: var(
    --vscode-button-secondaryBackground,
    var(--vscode-editor-background)
  );

  color: var(
    --vscode-button-secondaryForeground,
    var(--vscode-foreground)
  );

  border-color: var(--vscode-panel-border);
}

.ghost-btn:hover {
  background: var(
    --vscode-button-secondaryHoverBackground,
    var(--vscode-toolbar-hoverBackground)
  );

  border-color: var(--vscode-focusBorder);
}


/* =========================================================
   PRIMARY BUTTON
   ========================================================= */

.primary-btn {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border-color: var(--vscode-button-background);
  font-weight: 600;
}

.primary-btn:hover {
  background: var(--vscode-button-hoverBackground);
}


/* =========================================================
   SUBMIT BUTTON
   ========================================================= */

.submit-btn {
  background: var(--vscode-testing-iconPassed, #2ea043);
  color: #fff;
  border-color: var(--vscode-testing-iconPassed, #2ea043);
  font-weight: 600;
}

.submit-btn:hover {
  filter: brightness(1.08);
}


/* =========================================================
   SUMMARY
   ========================================================= */

.summary-bar {
  display: none;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--vscode-panel-border);
  font-size: 0.84em;
  flex-shrink: 0;
  background: var(--vscode-editor-background);
}

.summary-count {
  font-weight: 650;
  color: var(--vscode-descriptionForeground);
}

.summary-count.summary-all-pass {
  color: var(--vscode-testing-iconPassed, #4caf50);
}

.summary-unrun {
  color: var(--vscode-descriptionForeground);
  opacity: 0.75;
}


/* =========================================================
   TEST LIST
   ========================================================= */

.test-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 7px;
  box-sizing: border-box;
}


/* =========================================================
   TEST ROW
   ========================================================= */

.test-row {
  border: 1px solid var(--vscode-panel-border);
  border-left-width: 4px;
  border-radius: 1px;
  overflow: hidden;
  background: var(--vscode-editor-background);
  min-height: 38px;
  flex-shrink: 0;
}

.status-pending {
  border-left-color: var(--vscode-descriptionForeground);
}

.status-running {
  border-left-color: #2196f3;
}

.status-pass {
  border-left-color: #4caf50;
}

.status-fail {
  border-left-color: #f44336;
}

.status-error {
  border-left-color: #9c27b0;
}

.status-timeout {
  border-left-color: #ff9800;
}


/* =========================================================
   TEST HEADER
   ========================================================= */

.test-header {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 5px 9px;
  cursor: pointer;
  user-select: none;
  box-sizing: border-box;
  background: var(--vscode-editor-background);
  border-bottom: 1px solid transparent;
}

.test-header:hover {
  background: var(--vscode-list-hoverBackground);
}

.test-row.expanded .test-header {
  border-bottom-color: var(--vscode-panel-border);
}


/* =========================================================
   STATUS ICON
   ========================================================= */

.status-icon {
  width: 26px;
  height: 24px;
  min-width: 26px;
  min-height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  font-size: 13px;
  font-weight: 800;
  border: 1px solid var(--vscode-panel-border);
  border-radius: 1px;
  background: var(--vscode-editor-background);
  flex-shrink: 0;
}

.status-pass .status-icon {
  color: #4caf50;
  border-color: #4caf50;
  background: rgba(76, 175, 80, 0.08);
}

.status-fail .status-icon {
  color: #f44336;
  border-color: #f44336;
  background: rgba(244, 67, 54, 0.08);
}

.status-error .status-icon {
  color: #9c27b0;
  border-color: #9c27b0;
  background: rgba(156, 39, 176, 0.08);
}

.status-timeout .status-icon {
  color: #ff9800;
  border-color: #ff9800;
  background: rgba(255, 152, 0, 0.08);
}

.status-running .status-icon {
  color: #2196f3;
  border-color: #2196f3;
  background: rgba(33, 150, 243, 0.08);
}

.status-pending .status-icon {
  color: var(--vscode-descriptionForeground);
  border-color: var(--vscode-panel-border);
  background: var(--vscode-editor-background);
}


/* =========================================================
   TEST LABEL
   ========================================================= */

.test-label {
  flex: 1;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.test-time {
  font-size: 0.85em;
  color: var(--vscode-descriptionForeground);
  min-width: 46px;
  text-align: right;
}


/* =========================================================
   TEST ACTION BUTTONS
   ========================================================= */

.delete-test-btn,
.run-test-btn,
.edit-test-btn,
.dup-test-btn {
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border);
  color: var(--vscode-descriptionForeground);
  padding: 2px 6px;
  min-width: 24px;
  min-height: 23px;
  font-size: 0.85em;
  border-radius: 1px;
  line-height: 1;
}

.delete-test-btn:hover {
  color: var(--vscode-errorForeground);
  border-color: var(--vscode-errorForeground);
  background: var(--vscode-toolbar-hoverBackground);
}

.run-test-btn:hover {
  color: var(--vscode-testing-iconPassed, #2ea043);
  border-color: var(--vscode-testing-iconPassed, #2ea043);
  background: var(--vscode-toolbar-hoverBackground);
}

.edit-test-btn:hover,
.dup-test-btn:hover {
  color: var(--vscode-textLink-foreground, #3794ff);
  border-color: var(--vscode-textLink-foreground, #3794ff);
  background: var(--vscode-toolbar-hoverBackground);
}


/* =========================================================
   CHEVRON
   ========================================================= */

.chevron {
  display: inline-block;
  transition: transform 0.12s ease;
  color: var(--vscode-descriptionForeground);
  flex-shrink: 0;
}

.test-row.expanded .chevron {
  transform: rotate(90deg);
}


/* =========================================================
   TEST DETAILS
   ========================================================= */

.test-detail {
  display: none;
  padding: 10px;
  background: var(--vscode-editor-background);
  box-sizing: border-box;
}

.test-row.expanded .test-detail {
  display: block;
}


/* =========================================================
   INPUT / EXPECTED / ACTUAL
   ALWAYS VERTICAL
   ========================================================= */

.io-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.io-grid-2 {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
}


/* =========================================================
   IO BLOCK
   ========================================================= */

.io-block {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  overflow: hidden;
  border: 1px solid var(--vscode-panel-border);
  border-radius: 1px;
  background: var(--vscode-textCodeBlock-background);
}


/* =========================================================
   IO LABEL
   ========================================================= */

.io-label {
  font-size: 0.72em;
  font-weight: 650;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--vscode-descriptionForeground);
  margin: 0;
  padding: 6px 8px;
  min-height: 26px;
  display: flex;
  align-items: center;
  box-sizing: border-box;
  background: var(
    --vscode-editorWidget-background,
    var(--vscode-editor-background)
  );
  border-bottom: 1px solid var(--vscode-panel-border);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}


/* =========================================================
   IO CONTENT
   ========================================================= */

.io-block pre,
.error-output {
  background: var(--vscode-textCodeBlock-background);
  border: none;
  border-radius: 0;
  padding: 9px 10px;
  margin: 0;
  font-family: var(
    --vscode-editor-font-family,
    "Cascadia Code",
    Consolas,
    monospace
  );
  font-size: 0.88em;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  min-height: 48px;
  max-height: 240px;
  overflow-y: auto;
  box-sizing: border-box;
}


/* =========================================================
   ACTUAL OUTPUT
   ========================================================= */

.status-fail .actual-output {
  border-left: 3px solid #f44336;
}

.status-pass .actual-output {
  border-left: 3px solid #4caf50;
}


/* =========================================================
   ERROR OUTPUT
   ========================================================= */

.error-output {
  margin-top: 8px;
  color: var(--vscode-errorForeground);
  border: 1px solid #f44336;
  min-height: 0;
}


/* =========================================================
   DIFF
   ========================================================= */

.diff-line {
  display: block;
  padding: 1px 3px;
}

.diff-mismatch {
  background: rgba(244, 67, 54, 0.18);
  border-radius: 1px;
}


/* =========================================================
   EDIT MODE
   ========================================================= */

.edit-mode textarea {
  width: 100%;
  box-sizing: border-box;
  min-height: 110px;
  resize: vertical;
  background: var(
    --vscode-input-background,
    var(--vscode-textCodeBlock-background)
  );
  color: var(
    --vscode-input-foreground,
    var(--vscode-foreground)
  );
  border: 1px solid
    var(
      --vscode-input-border,
      var(--vscode-panel-border)
    );
  border-radius: 1px;
  padding: 8px 9px;
  font-family: var(
    --vscode-editor-font-family,
    "Cascadia Code",
    Consolas,
    monospace
  );
  font-size: 0.88em;
  line-height: 1.5;
  outline: none;
}

.edit-mode textarea:focus {
  border-color: var(--vscode-focusBorder);
  outline: 1px solid var(--vscode-focusBorder);
  outline-offset: -1px;
}


/* =========================================================
   EDIT ACTIONS
   ========================================================= */

.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 8px;
}

.edit-actions button {
  min-height: 27px;
  padding: 4px 10px;
}


/* =========================================================
   DRAFT ROW
   ========================================================= */

.draft-row {
  border-left-color: var(
    --vscode-textLink-foreground,
    #3794ff
  );
}

.draft-row .test-header {
  cursor: default;
}


/* =========================================================
   EMPTY STATE
   ========================================================= */

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 60px 24px;
  gap: 6px;
  box-sizing: border-box;
}

.empty-icon {
  font-size: 2em;
  opacity: 0.6;
  margin-bottom: 6px;
}

.empty-title {
  font-weight: 650;
  font-size: 1.05em;
}

.muted {
  color: var(--vscode-descriptionForeground);
  max-width: 320px;
}


/* =========================================================
   SCROLLBARS
   ========================================================= */

.test-list::-webkit-scrollbar,
.io-block pre::-webkit-scrollbar,
.error-output::-webkit-scrollbar,
.edit-mode textarea::-webkit-scrollbar {
  width: 8px;
}

.test-list::-webkit-scrollbar-thumb,
.io-block pre::-webkit-scrollbar-thumb,
.error-output::-webkit-scrollbar-thumb,
.edit-mode textarea::-webkit-scrollbar-thumb {
  background: var(--vscode-scrollbarSlider-background);
  border-radius: 1px;
}

.test-list::-webkit-scrollbar-thumb:hover,
.io-block pre::-webkit-scrollbar-thumb:hover,
.error-output::-webkit-scrollbar-thumb:hover,
.edit-mode textarea::-webkit-scrollbar-thumb:hover {
  background: var(--vscode-scrollbarSlider-hoverBackground);
}
`;