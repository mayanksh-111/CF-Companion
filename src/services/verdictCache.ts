import * as vscode from "vscode";
import { CfSubmission } from "../cfApi";
import { formatVerdict } from "../panels/dashboard/shared";
import { ProblemStatus } from "../panels/problemPanel";
import { ScrapedSubmissionRow } from "../server";

const STORE_KEY = "cfCompanion.verdictCache";

export interface StoredVerdict {
  verdict: string; // raw CF verdict string, e.g. "OK", "WRONG_ANSWER", "TESTING"
  problemName?: string;
  updatedAt: number;
}

// handle (lowercased) -> "contestId/problemCode" -> verdict
type VerdictStore = Record<string, Record<string, StoredVerdict>>;

let memState: vscode.Memento | undefined;
let output: vscode.OutputChannel | undefined;

export function initVerdictCache(context: vscode.ExtensionContext): void {
  memState = context.globalState;
  output = vscode.window.createOutputChannel("CF Companion Verdicts");
}

function readStore(): VerdictStore {
  return memState?.get<VerdictStore>(STORE_KEY, {}) ?? {};
}

async function writeStore(store: VerdictStore): Promise<void> {
  await memState?.update(STORE_KEY, store);
}

function key(contestId: string, problemCode: string): string {
  return `${contestId}/${problemCode}`;
}

const NON_FINAL_VERDICTS = new Set(["TESTING", "SUBMITTED", "QUEUED", "COMPILING", "RUNNING"]);

function isFinal(verdict: string): boolean {
  return !NON_FINAL_VERDICTS.has(verdict);
}

function isBetter(candidate: string, existing: string | undefined): boolean {
  if (!existing) return true;
  if (existing === "OK") return false;
  if (isFinal(existing) && !isFinal(candidate)) return false;
  return true;
}

export function getStoredVerdict(
  handle: string,
  contestId: string,
  problemCode: string,
): StoredVerdict | undefined {
  const store = readStore();
  return store[handle.toLowerCase()]?.[key(contestId, problemCode)];
}

export function isUncached(handle: string, contestId: string, problemCode: string): boolean {
  return getStoredVerdict(handle, contestId, problemCode) === undefined;
}

export function getResolvedStatus(
  handle: string,
  contestId: string,
  problemCode: string,
): ProblemStatus {
  const stored = getStoredVerdict(handle, contestId, problemCode);
  if (!stored) return "Not Attempted";
  return formatVerdict(stored.verdict) as ProblemStatus;
}

async function setVerdict(
  store: VerdictStore,
  handle: string,
  contestId: string,
  problemCode: string,
  verdict: string,
  problemName?: string,
): Promise<VerdictStore> {
  const h = handle.toLowerCase();
  const k = key(contestId, problemCode);
  const existing = store[h]?.[k];

  if (!isBetter(verdict, existing?.verdict)) {
    return store;
  }

  store[h] = store[h] ?? {};
  store[h][k] = { verdict, problemName, updatedAt: Date.now() };
  return store;
}

export type { ScrapedSubmissionRow };

export async function ingestScrapedSubmissions(
  handle: string,
  rows: ScrapedSubmissionRow[],
): Promise<void> {
  if (!rows.length) return;

  let store = readStore();

  const ordered = [...rows].sort((a, b) => (a.submissionTimeMs ?? 0) - (b.submissionTimeMs ?? 0));

  for (const row of ordered) {
    store = await setVerdict(
      store,
      handle,
      row.contestId,
      row.problemCode,
      row.verdict,
      row.problemName,
    );
  }

  await writeStore(store);
  output?.appendLine(
    `[ingest] handle=${handle} rows=${rows.length} verdicts=${rows.map((r) => `${r.contestId}${r.problemCode}:${r.verdict}`).join(", ")}`
  );
}


export async function recordVerdict(
  handle: string,
  contestId: string,
  problemCode: string,
  verdict: string,
  problemName?: string,
): Promise<void> {
  const store = await setVerdict(readStore(), handle, contestId, problemCode, verdict, problemName);
  await writeStore(store);
}

export async function syncVerdictsFromSubmissions(
  handle: string,
  submissions: CfSubmission[],
): Promise<void> {
  let store = readStore();

  for (let i = submissions.length - 1; i >= 0; i--) {
    const s = submissions[i];
    const contestId = s.problem.contestId?.toString();
    if (!contestId || !s.verdict) continue;

    store = await setVerdict(
      store,
      handle,
      contestId,
      s.problem.index,
      s.verdict,
      s.problem.name,
    );
  }

  await writeStore(store);
}