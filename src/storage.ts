import * as vscode from "vscode";
import * as path from "path";
import { ContestIndexEntry, IncomingProblem, ProblemIndex, ProblemMeta, LanguageId } from "./types";

const INDEX_FILE = "index.json";
const PROBLEMS_DIR = "problems";

export class ProblemStorage {
  private readonly root: vscode.Uri;
  private readonly problemsDir: vscode.Uri;
  private readonly indexFile: vscode.Uri;
  private indexCache: ProblemIndex | undefined;

  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  constructor(context: vscode.ExtensionContext) {
    this.root = context.globalStorageUri;
    this.problemsDir = vscode.Uri.joinPath(this.root, PROBLEMS_DIR);
    this.indexFile = vscode.Uri.joinPath(this.root, INDEX_FILE);
  }

  async init(): Promise<void> {
    await vscode.workspace.fs.createDirectory(this.problemsDir);
    try {
      await vscode.workspace.fs.stat(this.indexFile);
    } catch {
      await this.writeIndex({});
    }
  }

  private async readIndex(): Promise<ProblemIndex> {
    if (this.indexCache) {
      return this.indexCache;
    }
    try {
      const raw = await vscode.workspace.fs.readFile(this.indexFile);
      this.indexCache = JSON.parse(Buffer.from(raw).toString("utf8"));
    } catch {
      this.indexCache = {};
    }
    return this.indexCache!;
  }

  private async writeIndex(index: ProblemIndex): Promise<void> {
    this.indexCache = index;
    const data = Buffer.from(JSON.stringify(index, null, 2), "utf8");
    await vscode.workspace.fs.writeFile(this.indexFile, data);
  }

  private fileFor(contestId: string, problemCode: string): vscode.Uri {
    const safeContest = contestId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const safeCode = problemCode.replace(/[^a-zA-Z0-9_-]/g, "_");
    return vscode.Uri.joinPath(this.problemsDir, `${safeContest}_${safeCode}.json`);
  }

  /** Saves a freshly received problem and updates the contest/problem index. */
  async saveProblem(problem: IncomingProblem): Promise<void> {
    const file = this.fileFor(problem.contest_id, problem.problem_code);
    await vscode.workspace.fs.writeFile(file, Buffer.from(JSON.stringify(problem, null, 2), "utf8"));

    const index = await this.readIndex();
    const entry: ContestIndexEntry = index[problem.contest_id] ?? {
      contestId: problem.contest_id,
      problems: [],
    };

    const meta: ProblemMeta = {
      contestId: problem.contest_id,
      problemCode: problem.problem_code,
      problemName: problem.problem_name,
      url: problem.url,
      tags: problem.tags ?? [],
      savedAt: problem.timestamp ?? Date.now(),
    };

    entry.problems = entry.problems.filter((p) => p.problemCode !== problem.problem_code);
    entry.problems.push(meta);
    entry.problems.sort((a, b) => a.problemCode.localeCompare(b.problemCode));

    index[problem.contest_id] = entry;
    await this.writeIndex(index);
    this._onDidChange.fire();
  }

  async getIndex(): Promise<ProblemIndex> {
    return this.readIndex();
  }

  async loadProblem(contestId: string, problemCode: string): Promise<IncomingProblem | undefined> {
    try {
      const raw = await vscode.workspace.fs.readFile(this.fileFor(contestId, problemCode));
      return JSON.parse(Buffer.from(raw).toString("utf8"));
    } catch {
      return undefined;
    }
  }

  async deleteContest(contestId: string): Promise<void> {
    const index = await this.readIndex();
    const entry = index[contestId];
    if (!entry) return;
    for (const p of entry.problems) {
      try {
        await vscode.workspace.fs.delete(this.fileFor(contestId, p.problemCode));
      } catch {
        /* ignore */
      }
    }
    delete index[contestId];
    await this.writeIndex(index);
    this._onDidChange.fire();
  }

  async setSolutionPath(contestId: string, problemCode: string, solutionPath: string, language: LanguageId): Promise<void> {
    const index = await this.readIndex();
    const entry = index[contestId];
    if (!entry) return;
    const meta = entry.problems.find((p) => p.problemCode === problemCode);
    if (!meta) return;
    meta.solutionPath = solutionPath;
    meta.solutionLanguage = language;
    await this.writeIndex(index);
    this._onDidChange.fire();
}

async getSolutionPath(contestId: string, problemCode: string): Promise<{ path: string; language: LanguageId } | undefined> {
    const index = await this.readIndex();
    const meta = index[contestId]?.problems.find((p) => p.problemCode === problemCode);
    if (!meta?.solutionPath || !meta.solutionLanguage) return undefined;
    return { path: meta.solutionPath, language: meta.solutionLanguage };
}
}
