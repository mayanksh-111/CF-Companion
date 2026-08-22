import * as vscode from "vscode";
import { CustomTestStore, IncomingProblem, TestCase } from "../types";

const CUSTOM_TESTS_FILE = "custom-tests.json";

export class TestCaseParser {
  private readonly file: vscode.Uri;
  private cache: CustomTestStore | undefined;

  constructor(globalStorageUri: vscode.Uri) {
    this.file = vscode.Uri.joinPath(globalStorageUri, CUSTOM_TESTS_FILE);
  }

  extractSamples(problem: IncomingProblem): TestCase[] {
    return (problem.samples ?? []).map((s) => ({
      id: `sample-${s.index}`,
      origin: "sample" as const,
      input: s.input,
      expectedOutput: s.output,
    }));
  }

  async getCustomTests(contestId: string, problemCode: string): Promise<TestCase[]> {
    const store = await this.readStore();
    return store[`${contestId}/${problemCode}`] ?? [];
  }

  async getAllTests(problem: IncomingProblem): Promise<TestCase[]> {
    const samples = this.extractSamples(problem);
    const custom = await this.getCustomTests(problem.contest_id, problem.problem_code);
    return [...samples, ...custom];
  }

  async addCustomTest(
    contestId: string,
    problemCode: string,
    input: string,
    expectedOutput: string
  ): Promise<TestCase> {
    const store = await this.readStore();
    const key = `${contestId}/${problemCode}`;
    const list = store[key] ?? [];
    const test: TestCase = {
      id: `custom-${Date.now()}`,
      origin: "custom",
      input,
      expectedOutput,
    };
    list.push(test);
    store[key] = list;
    await this.writeStore(store);
    return test;
  }

  async deleteCustomTest(contestId: string, problemCode: string, testId: string): Promise<void> {
    const store = await this.readStore();
    const key = `${contestId}/${problemCode}`;
    store[key] = (store[key] ?? []).filter((t) => t.id !== testId);
    await this.writeStore(store);
  }

  async updateCustomTest(
    contestId: string,
    problemCode: string,
    testId: string,
    input: string,
    expectedOutput: string
  ): Promise<void> {
    const store = await this.readStore();
    const key = `${contestId}/${problemCode}`;
    const list = store[key] ?? [];
    const test = list.find((t) => t.id === testId);
    if (!test) return;
    test.input = input;
    test.expectedOutput = expectedOutput;
    await this.writeStore(store);
  }

  private async readStore(): Promise<CustomTestStore> {
    if (this.cache) return this.cache;
    try {
      const raw = await vscode.workspace.fs.readFile(this.file);
      this.cache = JSON.parse(Buffer.from(raw).toString("utf8"));
    } catch {
      this.cache = {};
    }
    return this.cache!;
  }

  private async writeStore(store: CustomTestStore): Promise<void> {
    this.cache = store;
    await vscode.workspace.fs.writeFile(this.file, Buffer.from(JSON.stringify(store, null, 2), "utf8"));
  }
}