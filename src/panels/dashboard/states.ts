import { renderShell } from "./styles";
import { escapeHtml } from "./shared";

function handleFormScript(nonce: string): string {
  return /* html */ `
    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      const input = document.getElementById("handleInput");
      const button = document.getElementById("saveBtn");

      function submit() {
        const value = input.value.trim();
        if (!value) {
          input.focus();
          return;
        }
        button.disabled = true;
        button.textContent = "Loading...";
        vscode.postMessage({ command: "setHandle", handle: value });
      }

      button.addEventListener("click", submit);
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") submit();
      });
      input.focus();
    </script>
  `;
}

export function renderNoHandle(): string {
  return renderShell(
    (nonce) => /* html */ `
      <main class="center-page">
        <div class="empty-icon">⌁</div>
        <h1>Codeforces Dashboard</h1>
        <p class="muted">
          Enter your Codeforces handle to load your profile, rating history,
          tag/difficulty breakdown, contests and recent submissions.
        </p>
        <div class="handle-form">
          <input id="handleInput" autocomplete="off" spellcheck="false" placeholder="e.g. tourist" />
          <button id="saveBtn">Load</button>
        </div>
      </main>
      ${handleFormScript(nonce)}
    `,
  );
}

export function renderLoading(handle: string): string {
  return renderShell(
    () => /* html */ `
      <main class="center-page">
        <div class="spinner"></div>
        <h2>Loading ${escapeHtml(handle)}</h2>
        <p class="muted">Fetching Codeforces data...</p>
      </main>
    `,
  );
}

export function renderError(handle: string, message: string): string {
  return renderShell(
    (nonce) => /* html */ `
      <main class="center-page">
        <div class="error-icon">!</div>
        <h1>Couldn't load ${escapeHtml(handle)}</h1>
        <p class="error-message">${escapeHtml(message)}</p>
        <div class="handle-form">
          <input id="handleInput" autocomplete="off" spellcheck="false" placeholder="try another handle" />
          <button id="saveBtn">Retry</button>
        </div>
      </main>
      ${handleFormScript(nonce)}
    `,
  );
}