import * as vscode from "vscode";
import { IncomingProblem, LanguageId, TestResult } from "../types";
import { TestCaseParser } from "./testCaseParser";
import { TestRunner } from "./testRunner";
import { TestPanel } from "../panels/testPanel";
import { getLanguageConfig, getDefaultSubmitCompiler } from "./languageConfig";

function isCompilerConfigured(language: LanguageId): boolean {
  const config = getLanguageConfig(language);
  return !!config.runCmd;
}

export class TestWorkflow {
  private currentSolution: vscode.Uri | undefined;
  private currentProblem: IncomingProblem | undefined;
  private currentLanguage: LanguageId | undefined;
  private selectedCompiler: string | undefined;

  constructor(
    private readonly parser: TestCaseParser,
    private readonly runner: TestRunner,
    private readonly getCompilers: () => string[]
  ) {}

  private compilersFor(language: LanguageId): { available: string[]; selected: string } {
    const available = this.getCompilers();
    const selected =
      this.selectedCompiler && available.includes(this.selectedCompiler)
        ? this.selectedCompiler
        : getDefaultSubmitCompiler(language);
    this.selectedCompiler = selected;
    return { available, selected };
  }

  clear(): void {
    this.currentProblem = undefined;
    this.currentLanguage = undefined;
    this.currentSolution = undefined;
    this.selectedCompiler = undefined;
  }

  async open(problem: IncomingProblem, language: LanguageId, solutionUri: vscode.Uri): Promise<void> {
    this.currentProblem = problem;
    this.currentLanguage = language;
    this.currentSolution = solutionUri;
    this.selectedCompiler = undefined; 

    const wasAlreadyOpen = TestPanel.isOpen;
    const tests = await this.parser.getAllTests(problem);
    const panel = TestPanel.show();
    const { available, selected } = this.compilersFor(language);
    const nextState = {
      problem,
      tests,
      results: new Map(),
      compilerConfigured: isCompilerConfigured(language),
      availableCompilers: available,
      selectedCompiler: selected,
    };

    if (wasAlreadyOpen) {
      panel.patchProblem(nextState);
    } else {
      panel.setState(nextState);
    }
  }

  async saveSolutionIfDirty(): Promise<void> {
    if (!this.currentSolution) return;
    const doc = vscode.workspace.textDocuments.find(
      (d) => d.uri.toString() === this.currentSolution!.toString()
    );
    if (doc && doc.isDirty) {
      await doc.save();
    }
  }

  async run(testId?: string): Promise<void> {
    if (!this.currentProblem || !this.currentLanguage || !this.currentSolution) {
      vscode.window.showWarningMessage("CF Companion: open a problem's tests before running them.");
      return;
    }

    await this.saveSolutionIfDirty();

    const allTests = await this.parser.getAllTests(this.currentProblem);
    const tests = testId ? allTests.filter((t) => t.id === testId) : allTests;
    if (testId && !tests.length) return; // stale id (e.g. test was deleted mid-run)

    const panel = TestPanel.show();

    if (!testId) {
      const { available, selected } = this.compilersFor(this.currentLanguage);
      panel.setState({
        problem: this.currentProblem,
        tests: allTests,
        results: new Map(),
        compilerConfigured: isCompilerConfigured(this.currentLanguage),
        availableCompilers: available,
        selectedCompiler: selected,
      });
    }

    if (!isCompilerConfigured(this.currentLanguage)) return;

    await this.runner.runAll(this.currentSolution, this.currentLanguage, tests, (result: TestResult) => {
      panel.patchResult(result);
    });

  }
  async saveNewTest(input: string, expectedOutput: string): Promise<void> {
    if (!this.currentProblem) return;

    await this.parser.addCustomTest(
      this.currentProblem.contest_id,
      this.currentProblem.problem_code,
      input,
      expectedOutput
    );

    await this.refreshPanel();
  }

  async updateTest(testId: string, input: string, expectedOutput: string): Promise<void> {
    if (!this.currentProblem) return;

    await this.parser.updateCustomTest(
      this.currentProblem.contest_id,
      this.currentProblem.problem_code,
      testId,
      input,
      expectedOutput
    );

    await this.refreshPanel();
  }

  async deleteCustomTest(testId: string): Promise<void> {
    if (!this.currentProblem) return;
    await this.parser.deleteCustomTest(this.currentProblem.contest_id, this.currentProblem.problem_code, testId);
    await this.refreshPanel();
  }

  private async refreshPanel(): Promise<void> {
    if (!this.currentProblem) return;
    const tests = await this.parser.getAllTests(this.currentProblem);
    const { available, selected } = this.compilersFor(this.currentLanguage ?? "cpp");
    TestPanel.show().setState({
      problem: this.currentProblem,
      tests,
      results: new Map(),
      compilerConfigured: this.currentLanguage ? isCompilerConfigured(this.currentLanguage) : true,
      availableCompilers: available,
      selectedCompiler: selected,
    });
  }

  refreshCompilers(compilers: string[]): void {
    if (!TestPanel.isOpen) return;
    TestPanel.show().updateCompilers(compilers);
  }

  get activeProblem(): IncomingProblem | undefined {
    return this.currentProblem;
  }
}