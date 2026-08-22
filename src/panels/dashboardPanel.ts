import * as vscode from "vscode";
import {
  CfRatingChange,
  CfSubmission,
  CfUser,
  fetchUserInfo,
  fetchUserRatingHistory,
} from "../cfApi";
import { getFullSubmissions, invalidate as invalidateSubmissionsCache } from "../services/submissionsCache";
import { syncVerdictsFromSubmissions } from "../services/verdictCache";
import { renderNoHandle, renderLoading, renderError } from "./dashboard/states";
import { renderDashboard } from "./dashboard/render";


const FULL_REFRESH_MS = 6 * 60 * 60 * 1000;

export class DashboardPanel {
  private static current: DashboardPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  private pollTimer: ReturnType<typeof setTimeout> | undefined;
  private isRefreshing = false;
  private lastSubmissions: CfSubmission[] = [];
  private lastUser: CfUser | undefined;
  private lastRatingHistory: CfRatingChange[] = [];
  private lastFullFetch = 0;

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
  ) {
    this.panel = panel;

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      async (msg) => {
        if (msg.command === "openUrl" && typeof msg.url === "string") {
          try {
            await vscode.env.openExternal(vscode.Uri.parse(msg.url));
          } catch {
            // Ignore malformed URLs.
          }
        }

        if (msg.command === "setHandle" && typeof msg.handle === "string" && msg.handle.trim()) {
          const trimmed = msg.handle.trim();
          const current = vscode.workspace.getConfiguration().get<string>("cfCompanion.handle", "");
          if (current && current !== trimmed) {
            invalidateSubmissionsCache(current);
          }
          await vscode.workspace
            .getConfiguration()
            .update("cfCompanion.handle", trimmed, vscode.ConfigurationTarget.Global);
          await this.refresh();
        }
      },
      null,
      this.disposables,
    );
  }

  static show(context: vscode.ExtensionContext): void {
    if (DashboardPanel.current) {
      // Just reveal — no forced refetch. The 6h full refresh runs on its
      // own schedule independent of the panel being reopened/revealed.
      DashboardPanel.current.panel.reveal();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "cfCompanionDashboard",
      "Dashboard",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    DashboardPanel.current = new DashboardPanel(panel, context);

    DashboardPanel.current.refresh();
  }

  private async refresh(opts?: { background?: boolean }): Promise<void> {
    const background = opts?.background ?? false;

    if (this.isRefreshing) {
      return;
    }

    const handle = vscode.workspace
      .getConfiguration()
      .get<string>("cfCompanion.handle", "")
      .trim();

    if (!handle) {
      this.stopPolling();
      this.panel.webview.html = renderNoHandle();
      return;
    }

    if (!background) {
      this.panel.webview.html = renderLoading(handle);
    } else {
      this.panel.webview.postMessage({ command: "refreshing" });
    }

    this.isRefreshing = true;

    try {
      const [user, submissions, ratingHistory]: [
        CfUser,
        CfSubmission[],
        CfRatingChange[],
      ] = await Promise.all([
        fetchUserInfo(handle),
        getFullSubmissions(handle),
        fetchUserRatingHistory(handle).catch(() => []), // unrated users -> just no graph/contest list
      ]);

      this.lastSubmissions = submissions;
      this.lastUser = user;
      this.lastRatingHistory = ratingHistory;
      this.lastFullFetch = Date.now();

      // Every full dashboard refresh also updates the stored verdict for
      // every problem seen in the submission history.
      await syncVerdictsFromSubmissions(handle, submissions);

      this.panel.webview.html = renderDashboard(
        user,
        submissions,
        ratingHistory,
      );
      this.schedulePoll();
    } catch (err: any) {
      if (!background) {
        this.panel.webview.html = renderError(
          handle,
          err?.message ?? String(err),
        );
      }
      
      this.schedulePoll();
    } finally {
      this.isRefreshing = false;
    }
  }

  private schedulePoll(): void {
    this.stopPolling();

    const elapsed = Date.now() - this.lastFullFetch;
    const delay = Math.max(FULL_REFRESH_MS - elapsed, 0);

    this.pollTimer = setTimeout(() => {
      this.refresh({ background: true });
    }, delay);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  dispose(): void {
    DashboardPanel.current = undefined;

    this.stopPolling();
    this.panel.dispose();

    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}