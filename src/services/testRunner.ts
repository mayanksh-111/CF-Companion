import * as vscode from "vscode";
import * as cp from "child_process";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { LanguageId, TestCase, TestResult } from "../types";
import { getConfiguredTimeoutMs, getLanguageConfig } from "./languageConfig";
import { outputsMatch } from "./outputComparator";

interface RunOutcome {
  stdout: string;
  stderr: string;
  timeMs: number;
  timedOut: boolean;
  exitCode: number | null;
}

export class TestRunner {
  async runAll(
    solutionUri: vscode.Uri,
    language: LanguageId,
    tests: TestCase[],
    onResult: (result: TestResult) => void
  ): Promise<void> {
    const config = getLanguageConfig(language);
    const file = solutionUri.fsPath;
    const dir = path.dirname(file);
    const binaryBase = path.join(os.tmpdir(), `cph-${path.basename(file)}-${Date.now()}`);
    const executablePath = process.platform === "win32" ? `${binaryBase}.exe` : binaryBase;

    for (const t of tests) {
      onResult({ testId: t.id, status: "running" });
    }

    if (config.compileCmd) {
      const { cmd, args } = config.compileCmd({ file, dir, binaryBase: executablePath });
      const compileResult = await this.runProcess(cmd, args, "", 20_000);
      if (compileResult.exitCode !== 0) {
        const message = compileResult.stderr || compileResult.stdout || "Compilation failed.";
        for (const t of tests) {
          onResult({ testId: t.id, status: "error", errorMessage: message });
        }
        this.cleanupBinary(binaryBase, language);
        return;
      }
    }

    const timeoutMs = getConfiguredTimeoutMs();

    for (const t of tests) {
      const { cmd, args } = config.runCmd({ file, dir, binaryBase: executablePath });
      try {
        const outcome = await this.runProcess(cmd, args, t.input, timeoutMs);
        if (outcome.timedOut) {
          onResult({ testId: t.id, status: "timeout", timeMs: timeoutMs });
          continue;
        }
        if (outcome.exitCode !== 0) {
          onResult({
            testId: t.id,
            status: "error",
            stderr: outcome.stderr,
            timeMs: outcome.timeMs,
            errorMessage: outcome.stderr || `Exited with code ${outcome.exitCode}`,
          });
          continue;
        }
        const pass = outputsMatch(t.expectedOutput, outcome.stdout);
        onResult({
          testId: t.id,
          status: pass ? "pass" : "fail",
          actualOutput: outcome.stdout,
          stderr: outcome.stderr || undefined,
          timeMs: outcome.timeMs,
        });
      } catch (err: any) {
        onResult({
          testId: t.id,
          status: "error",
          errorMessage: err?.message ?? String(err),
        });
      }
    }

    this.cleanupBinary(binaryBase, language);
  }

  private runProcess(cmd: string, args: string[], stdin: string, timeoutMs: number): Promise<RunOutcome> {
      return new Promise((resolve) => {
        const spawnStart = process.hrtime.bigint();
        let stdout = "";
        let stderr = "";
        let timedOut = false;
        let settled = false;
        let exitTimeNs: bigint | undefined;
        let spawnedTimeNs: bigint | undefined;

        const child = cp.spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });

        child.on("spawn", () => {
          spawnedTimeNs = process.hrtime.bigint();
        });

        const timer = setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, timeoutMs);

        const finish = (exitCode: number | null) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          
          const startNs = spawnedTimeNs ?? spawnStart;
          const endNs = exitTimeNs ?? process.hrtime.bigint();
          const timeMs = Number(endNs - startNs) / 1_000_000;

          resolve({ stdout, stderr, timeMs: Math.round(timeMs), timedOut, exitCode });
        };

        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");

        child.stdout.on("data", (d) => (stdout += d));
        child.stderr.on("data", (d) => (stderr += d));

        child.on("error", (err) => {
          stderr += err.message;
          finish(-1);
        });

        child.on("exit", () => {
          exitTimeNs = process.hrtime.bigint();
        });

        child.on("close", (code) => {
          setImmediate(() => finish(code));
        });

        if (child.stdin.writable) {
          child.stdin.end(stdin);
        }
      });
  }

  private cleanupBinary(binaryBase: string, language: LanguageId): void {
    if (language !== "cpp") return; 
    try {
      const exe = process.platform === "win32" ? `${binaryBase}.exe` : binaryBase;
      if (fs.existsSync(exe)) fs.unlinkSync(exe);
    } catch {
      /* best-effort cleanup */
    }
  }
}