import * as vscode from "vscode";
import { randomUUID } from "crypto";
import { ContestKind, IncomingProblem, SubmitJob, SubmitResult } from "./types";

export function resolveSubmitTarget(problem: IncomingProblem): {
  kind: ContestKind;
  submitUrl: string;
} {
  const url = problem.url ?? "";

  const gymMatch = url.match(/codeforces\.com\/gym\/(\d+)/i);
  if (gymMatch) {
    return { kind: "gym", submitUrl: `https://codeforces.com/gym/${gymMatch[1]}/submit` };
  }

  const contestMatch = url.match(/codeforces\.com\/contest\/(\d+)/i);
  if (contestMatch) {
    return { kind: "contest", submitUrl: `https://codeforces.com/contest/${contestMatch[1]}/submit` };
  }

  const problemsetMatch = url.match(/codeforces\.com\/problemset\/problem\/(\d+)/i);
  if (problemsetMatch) {
    return { kind: "problemset", submitUrl: `https://codeforces.com/problemset/submit` };
  }

  throw new Error(
    `Could not determine whether "${problem.contest_id}${problem.problem_code}" is a contest, gym, or problemset problem from its URL (${url || "no URL stored"}).`
  );
}

export class SubmitJobQueue implements vscode.Disposable {
  private pending: SubmitJob | undefined;

  private claimedAt: number | undefined;
  private static readonly CLAIM_GRACE_MS = 5_000;
  private readonly waiters = new Map<string, (result: SubmitResult) => void>();
  private readonly output: vscode.OutputChannel;

  constructor() {
    this.output = vscode.window.createOutputChannel("CF Companion: Submit");
  }

  get hasPendingJob(): boolean {
    return this.pending !== undefined;
  }

  enqueue(job: SubmitJob, timeoutMs = 20_000): Promise<SubmitResult> {
    if (this.hasPendingJob) {
      return Promise.reject(
        new Error("A submission is already in progress. Please wait for it to finish.")
      );
    }

    this.pending = job;
    this.claimedAt = undefined;
    this.output.appendLine(`Queued job ${job.jobId} for ${job.contestId}${job.problemCode} (${job.kind}).`);

    return new Promise<SubmitResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(job.jobId);
        if (this.pending?.jobId === job.jobId) {
          this.pending = undefined;
          this.claimedAt = undefined;
        }
        reject(
          new Error(
            "Timed out waiting for the Codeforces tab to pick up the submission. Make sure codeforces.com is open in Chrome with the CF Companion Helper installed and enabled."
          )
        );
      }, timeoutMs);

      this.waiters.set(job.jobId, (result) => {
        clearTimeout(timer);
        resolve(result);
      });
    });
  }

  takeNextJob(): SubmitJob | undefined {
    if (!this.pending) {
      return undefined;
    }
    const now = Date.now();
    if (this.claimedAt !== undefined && now - this.claimedAt < SubmitJobQueue.CLAIM_GRACE_MS) {
      return undefined;
    }
    this.claimedAt = now;
    this.output.appendLine(`Job ${this.pending.jobId} handed to polling tab.`);
    return this.pending;
  }

  /** Called from the /submit-result HTTP handler. */
  reportResult(result: SubmitResult): boolean {
    const waiter = this.waiters.get(result.jobId);
    this.waiters.delete(result.jobId);
    if (this.pending?.jobId === result.jobId) {
      this.pending = undefined;
      this.claimedAt = undefined;
    }
    this.output.appendLine(
      `Job ${result.jobId} result: ${result.ok ? "OK" : "FAILED"} — ${result.message}`
    );
    if (!waiter) {
      // Result arrived after we'd already timed out / given up on it —
      // still worth logging, but there's no promise left to resolve.
      return false;
    }
    waiter(result);
    return true;
  }

  dispose(): void {
    this.output.dispose();
    this.waiters.clear();
    this.pending = undefined;
    this.claimedAt = undefined;
  }
}

export interface BuildJobOptions {
  compiler: string;
  dryRun: boolean;
  expectedHandle: string;
}

export function buildSubmitJob(
  problem: IncomingProblem,
  fileName: string,
  fileContent: Buffer,
  options: BuildJobOptions
): SubmitJob {
  const target = resolveSubmitTarget(problem);
  return {
    jobId: randomUUID(),
    contestId: problem.contest_id,
    problemCode: problem.problem_code,
    kind: target.kind,
    submitUrl: target.submitUrl,
    fileName,
    fileContentBase64: fileContent.toString("base64"),
    compiler: options.compiler,
    dryRun: options.dryRun,
    expectedHandle: options.expectedHandle,
  };
}