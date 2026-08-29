import * as vscode from "vscode";
import { ProblemStorage } from "../storage";
import { ProblemMeta } from "../types";

type TreeNode = ContestNode | ProblemNode;

class ContestNode {
  readonly kind = "contest" as const;
  constructor(public readonly contestId: string, public readonly problems: ProblemMeta[]) {}
}

class ProblemNode {
  readonly kind = "problem" as const;
  constructor(public readonly meta: ProblemMeta) {}
}

export class ContestsTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly storage: ProblemStorage) {
    storage.onDidChange(() => this._onDidChangeTreeData.fire());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    if(element.kind === "contest") {
      const item = new vscode.TreeItem(`Contest ${element.contestId}`, vscode.TreeItemCollapsibleState.Collapsed);
      item.iconPath = new vscode.ThemeIcon("folder");
      item.contextValue = "contest";
      item.description = `${element.problems.length} problem${element.problems.length === 1 ? "" : "s"}`;
      return item;
    }

    const p = element.meta;
    const item = new vscode.TreeItem(`${p.problemCode} — ${p.problemName}`, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon("symbol-event");
    item.description = p.tags.slice(0, 3).join(", ");
    item.contextValue = "problem";
    item.command = {command: "cfCompanion.openProblem", title: "Open Problem", arguments: [p.contestId, p.problemCode]};
    return item;
  }

  async getChildren(element?: TreeNode): Promise<TreeNode[]> {
    const index = await this.storage.getIndex();
    if(!element){
      return Object.values(index)
        .sort((a, b) => Number(b.contestId) - Number(a.contestId))
        .map((entry) => new ContestNode(entry.contestId, entry.problems));
    }

    if(element.kind === "contest"){
      return element.problems
        .slice()
        .sort((a, b) => a.problemCode.localeCompare(b.problemCode))
        .map((p) => new ProblemNode(p));
    }
    return [];
  }
}
