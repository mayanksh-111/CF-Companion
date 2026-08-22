import * as vscode from "vscode";
import * as path from "path";
import { IncomingProblem, LanguageId, SolutionMeta } from "../types";
import { getSolutionTemplate } from "./languageConfig";

const META_SUFFIX = ".cph-meta.json";

export class SolutionManager {
  async createSolution(
    problem: IncomingProblem,
    language: LanguageId,
    baseDir: vscode.Uri
  ): Promise<vscode.Uri> {
    const template = getSolutionTemplate(language);
    const safeCode = `${problem.contest_id}${problem.problem_code}`.replace(/[^a-zA-Z0-9_-]/g, "_");

    const solutionUri =
      language === "java"
        ? vscode.Uri.joinPath(baseDir, safeCode, "Solution.java")
        : vscode.Uri.joinPath(baseDir, `${safeCode}${path.extname(template.fileName)}`);

    if (language === "java") {
      await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(baseDir, safeCode));
    }

    const exists = await this.fileExists(solutionUri);
    if (!exists) {
      await vscode.workspace.fs.writeFile(solutionUri, Buffer.from(template.content, "utf8"));
    }

    const meta: SolutionMeta = {
      platform: "codeforces",
      contestId: problem.contest_id,
      problemCode: problem.problem_code,
      language,
      createdAt: Date.now(),
    };
    
    await this.writeMeta(solutionUri, meta, baseDir);

    return solutionUri;
  }

  async readMeta(solutionUri: vscode.Uri, baseDir: vscode.Uri): Promise<SolutionMeta | undefined> {
    const metaUri = this.metaUriFor(solutionUri, baseDir);
    try {
      const raw = await vscode.workspace.fs.readFile(metaUri);
      return JSON.parse(Buffer.from(raw).toString("utf8"));
    } catch {
      return undefined;
    }
  }

  private async writeMeta(solutionUri: vscode.Uri, meta: SolutionMeta, baseDir: vscode.Uri): Promise<void> {
    const metaDir = vscode.Uri.joinPath(baseDir, "meta");
    await vscode.workspace.fs.createDirectory(metaDir);
    const metaUri = this.metaUriFor(solutionUri, baseDir);
    await vscode.workspace.fs.writeFile(metaUri, Buffer.from(JSON.stringify(meta, null, 2), "utf8"));
  }

  private metaUriFor(solutionUri: vscode.Uri, baseDir: vscode.Uri): vscode.Uri {
    const key = Buffer.from(solutionUri.fsPath).toString("base64url");
    return vscode.Uri.joinPath(baseDir, "meta", `${key}${META_SUFFIX}`);
  }

  private async fileExists(uri: vscode.Uri): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(uri);
      return true;
    } catch {
      return false;
    }
  }
}