import * as vscode from "vscode";
import { ProblemStorage } from "../storage";
import { SolutionManager } from "./solutionManager";
import { IncomingProblem, LanguageId } from "../types";
import { detectLanguageFromExtension } from "./languageConfig";

export interface ResolvedContext {
  problem: IncomingProblem;
  language: LanguageId;
  solutionUri: vscode.Uri;
}

export class ProblemContextService {
  constructor(
    private readonly storage: ProblemStorage,
    private readonly solutions: SolutionManager,
    private readonly getBaseDir: () => vscode.Uri
  ) {}

  async resolve(document?: vscode.TextDocument): Promise<ResolvedContext | undefined> {
    const doc = document ?? vscode.window.activeTextEditor?.document;
    const baseDir = this.getBaseDir;
    if (!doc || doc.uri.scheme !== "file") {
      return undefined;
    }

    const language = detectLanguageFromExtension(doc.uri.fsPath);
    if (!language) {
      return undefined;
    }

    const meta = await this.solutions.readMeta(doc.uri,baseDir());
    if (!meta) {
      return undefined;
    }

    const problem = await this.storage.loadProblem(meta.contestId, meta.problemCode);
    if (!problem) {
      return undefined;
    }

    return { problem, language: meta.language, solutionUri: doc.uri };
  }
}