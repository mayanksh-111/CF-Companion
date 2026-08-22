export interface Sample {
  index: number;
  input: string;
  output: string;
}

export interface IncomingProblem {
  type: "problem";
  contest_id: string;
  problem_code: string;
  problem_name: string;
  url: string;
  time_limit: string;
  memory_limit: string;
  tags: string[];
  statement_html: string;
  samples: Sample[];
  timestamp: number;
}

export interface IncomingProblemError {
  type: "problem_error";
  contest_id: string | null;
  problem_code: string;
  url: string;
  error: string;
  timestamp: number;
}

export interface IncomingContestMetadata {
  type: "contest_metadata";
  contest_id: string;
  name: string;
  url: string;
  problem_count: number;
  timestamp: number;
}

export interface IncomingContestComplete {
  type: "contest_complete";
  contest_id: string;
  name: string;
  problem_count: number;
  successful: number;
  failed: number;
  timestamp: number;
}

export interface IncomingCompilerList {
  type: "compiler_list";
  compilers: string[];
  timestamp: number;
}

export type IncomingMessage =
  | IncomingProblem
  | IncomingProblemError
  | IncomingContestMetadata
  | IncomingContestComplete
  | IncomingCompilerList;

/** How a problem is keyed and indexed on disk. */
export interface ProblemMeta {
  contestId: string;
  problemCode: string;
  problemName: string;
  url: string;
  tags: string[];
  savedAt: number;
  solutionPath?: string;
  solutionLanguage?: LanguageId;
}

export interface ContestIndexEntry {
  contestId: string;
  problems: ProblemMeta[];
}

export type ProblemIndex = Record<string, ContestIndexEntry>;
export type ContestKind = "contest" | "problemset" | "gym";

export interface SubmitJob {
  jobId: string;
  contestId: string;
  problemCode: string;
  kind: ContestKind;
  submitUrl: string;
  fileName: string;
  fileContentBase64: string;
  compiler: string;
  dryRun: boolean;
  expectedHandle: string;
}

export type SubmitPollResponse = { job: SubmitJob } | { job: null };

export interface SubmitResult {
  jobId: string;
  ok: boolean;
  message: string;
}


export type LanguageId = "cpp" | "python" | "java";

export interface TestCase {
  id: string;
  origin: "sample" | "custom";
  input: string;
  expectedOutput: string;
}

export interface TestResult {
  testId: string;
  status: "pass" | "fail" | "error" | "timeout" | "running" | "pending";
  actualOutput?: string;
  stderr?: string;
  timeMs?: number;
  errorMessage?: string;
}

export interface SolutionMeta {
  platform: "codeforces";
  contestId: string;
  problemCode: string;
  language: LanguageId;
  createdAt: number;
}

export type CustomTestStore = Record<string, TestCase[]>; 
export interface SidebarHost {
  readonly isResolved: boolean;
  reveal(tabId: string): void;
  setTabContent(tabId: string, html: string): void;
  setTabTitle(tabId: string, title: string): void;
  postToTab(tabId: string, message: any): void;
  onTabMessage(tabId: string, handler: (message: any) => void): void;
}